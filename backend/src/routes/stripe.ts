import express from 'express';
import { requireActiveGuild } from '../middlewares/auth';
import pool from '../lib/db';
import Stripe from 'stripe';

const router = express.Router();

// Define Stripe core types dynamically using TypeScript return types
type StripeInstance = InstanceType<typeof Stripe>;
type CheckoutSession = Awaited<ReturnType<StripeInstance['checkout']['sessions']['retrieve']>>;
type StripeInvoice = Awaited<ReturnType<StripeInstance['invoices']['retrieve']>>;
type StripeSubscription = Awaited<ReturnType<StripeInstance['subscriptions']['retrieve']>>;

// Initialize Stripe if secret key is present
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
let stripe: StripeInstance | null = null;

if (stripeSecretKey) {
  stripe = new Stripe(stripeSecretKey);
  console.log('[Stripe] Successfully initialized Stripe client.');
} else {
  console.log('[Stripe] STRIPE_SECRET_KEY not set. Operating in MOCK / SIMULATOR mode.');
}

// POST /api/stripe/create-checkout-session : Crée une session Stripe de paiement ou simule
router.post('/create-checkout-session', requireActiveGuild, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    const { tier } = req.body;

    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild found in session.' });
    }

    if (!tier || !['medium', 'pro'].includes(tier)) {
      return res.status(400).json({ status: 'error', message: 'Invalid subscription tier selected.' });
    }

    // Security check: Only GMs and Officers (rank <= 2) can manage or activate subscriptions!
    const userRes = await pool.query('SELECT rank FROM users WHERE id = $1', [req.user!.id]);
    const userRank = userRes.rows[0]?.rank;
    
    if (userRank === null || userRank === undefined || userRank > 2) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only Guild Masters and Officers are authorized to manage or activate subscriptions.'
      });
    }

    // Fallback to simulator/mock if Stripe is not configured
    if (!stripe) {
      const mockSessionId = `mock_cs_${Math.random().toString(36).substring(2, 15)}`;
      const checkoutUrl = `/payment?session_id=${mockSessionId}&guild_id=${guildId}&tier=${tier}`;
      return res.json({ url: checkoutUrl });
    }

    // Retrieve guild details to reuse customer if possible
    const guildRes = await pool.query('SELECT name, stripe_customer_id FROM guilds WHERE id = $1', [guildId]);
    const guild = guildRes.rows[0];

    if (!guild) {
      return res.status(404).json({ status: 'error', message: 'Guild not found.' });
    }

    // Set up product price and description
    const planName = tier === 'pro' ? "Unity'Z Guild - Pro Subscription" : "Unity'Z Guild - Standard Subscription";
    const planDesc = tier === 'pro'
      ? "Accès complet aux fonctionnalités de la guilde, synchronisation Discord complète, et gestion de cotisations Pro."
      : "Accès standard aux fonctionnalités de la guilde et gestion de cotisations.";
    const priceAmount = tier === 'pro' ? 499 : 299; // in cents (4.99 EUR / 2.99 EUR)

    // Let compiler infer SessionCreateParams dynamically
    const sessionParams = {
      payment_method_types: ['card'] as ('card')[],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: planName,
              description: planDesc,
            },
            unit_amount: priceAmount,
            recurring: {
              interval: 'month' as const
            }
          },
          quantity: 1,
        }
      ],
      mode: 'subscription' as const,
      metadata: {
        guild_id: guildId,
        tier: tier
      },
      success_url: `${process.env.FRONTEND_URL}/payment?session_id={CHECKOUT_SESSION_ID}&guild_id=${guildId}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment`,
      customer: guild.stripe_customer_id || undefined
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

// GET /api/stripe/checkout-session/:sessionId : Valide et active immédiatement l'abonnement
router.get('/checkout-session/:sessionId', requireActiveGuild, async (req, res, next) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    const guildId = req.user!.active_guild_id;

    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild found in session.' });
    }

    // Handle mock session
    if (sessionId.startsWith('mock_')) {
      const tier = (req.query.tier as string) || 'pro';
      const interval = '30 days';

      const result = await pool.query(
        `UPDATE guilds 
         SET subscription_tier = $1, 
             subscription_expires_at = CURRENT_TIMESTAMP + $2::interval, 
             subscription_status = 'active',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3 
         RETURNING *`,
        [tier, interval, guildId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ status: 'error', message: 'Guild not found.' });
      }

      return res.json({
        status: 'success',
        tier: tier,
        message: `Subscription successfully mock-activated for tier: ${tier}`,
        guild: result.rows[0]
      });
    }

    if (!stripe) {
      return res.status(400).json({ status: 'error', message: 'Stripe is not configured and session is not a mock ID.' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid' && session.metadata?.guild_id === guildId) {
      const tier = session.metadata.tier || 'medium';
      const stripeCustomerId = session.customer as string;
      const stripeSubscriptionId = session.subscription as string;

      let expiresAt: Date;
      if (stripeSubscriptionId) {
        try {
          const subscription = (await stripe.subscriptions.retrieve(stripeSubscriptionId)) as unknown as { current_period_end: number };
          const periodEnd = subscription?.current_period_end;
          if (periodEnd && !isNaN(Number(periodEnd))) {
            expiresAt = new Date(Number(periodEnd) * 1000);
          } else {
            console.warn('[Stripe] Invalid current_period_end returned. Falling back to 30 days.');
            expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);
          }
        } catch (err) {
          console.error('[Stripe] Error retrieving subscription details. Using 30-day fallback:', err);
          expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        }
      } else {
        expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      const result = await pool.query(
        `UPDATE guilds 
         SET subscription_tier = $1, 
             subscription_expires_at = $2, 
             stripe_customer_id = $3,
             stripe_subscription_id = $4,
             subscription_status = 'active',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $5
         RETURNING *`,
        [tier, expiresAt, stripeCustomerId, stripeSubscriptionId, guildId]
      );

      return res.json({
        status: 'success',
        tier: tier,
        expiresAt: expiresAt,
        message: 'Subscription successfully activated via Stripe.',
        guild: result.rows[0]
      });
    }

    res.status(400).json({ status: 'error', message: 'Payment not completed or guild ID mismatch.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/stripe/webhook : Webhook pour écouter les événements de paiement réels de Stripe
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    return res.status(400).send('Stripe client not initialized');
  }

  let event;

  try {
    if (!sig || !endpointSecret) {
      throw new Error('Webhook signature or endpoint secret missing');
    }
    const rawBody = (req as any).rawBody;
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error(`❌ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as CheckoutSession;
        const guildId = session.metadata?.guild_id;
        const tier = session.metadata?.tier || 'medium';
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (guildId) {
          let expiresAt: Date;
          if (stripeSubscriptionId) {
            try {
              const subscription = (await stripe.subscriptions.retrieve(stripeSubscriptionId)) as unknown as { current_period_end: number };
              const periodEnd = subscription?.current_period_end;
              if (periodEnd && !isNaN(Number(periodEnd))) {
                expiresAt = new Date(Number(periodEnd) * 1000);
              } else {
                expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + 1);
              }
            } catch (err) {
              console.error('[Stripe Webhook] Failed to retrieve subscription details. Using 30-day fallback:', err);
              expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 1);
            }
          } else {
            expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);
          }

          await pool.query(
            `UPDATE guilds 
             SET subscription_tier = $1, 
                 subscription_expires_at = $2, 
                 stripe_customer_id = $3,
                 stripe_subscription_id = $4,
                 subscription_status = 'active',
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = $5`,
            [tier, expiresAt, stripeCustomerId, stripeSubscriptionId, guildId]
          );
          console.log(`[Stripe Webhook] Guild ${guildId} subscription activated for tier ${tier}.`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as StripeInvoice;
        const stripeSubscriptionId = (invoice as unknown as { subscription: string | null }).subscription;

        if (stripeSubscriptionId) {
          let expiresAt: Date;
          try {
            const subscription = (await stripe.subscriptions.retrieve(stripeSubscriptionId)) as unknown as { current_period_end: number };
            const periodEnd = subscription?.current_period_end;
            if (periodEnd && !isNaN(Number(periodEnd))) {
              expiresAt = new Date(Number(periodEnd) * 1000);
            } else {
              expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 1);
            }
          } catch (err) {
            console.error('[Stripe Webhook] Failed to retrieve subscription details for invoice. Using 30-day fallback:', err);
            expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);
          }

          await pool.query(
            `UPDATE guilds 
             SET subscription_expires_at = $1, 
                 subscription_status = 'active',
                 updated_at = CURRENT_TIMESTAMP 
             WHERE stripe_subscription_id = $2`,
            [expiresAt, stripeSubscriptionId]
          );
          console.log(`[Stripe Webhook] Subscription ${stripeSubscriptionId} renewed until ${expiresAt}.`);
        }
        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as StripeSubscription;
        const stripeSubscriptionId = subscription.id;
        const status = subscription.status;
        const subscriptionObj = subscription as unknown as { current_period_end: number | undefined };
        const periodEnd = subscriptionObj?.current_period_end;

        let expiresAt: Date | null = null;
        let tier = 'none';

        if (status === 'active' || status === 'trialing') {
          const guildRes = await pool.query('SELECT subscription_tier FROM guilds WHERE stripe_subscription_id = $1', [stripeSubscriptionId]);
          tier = guildRes.rows[0]?.subscription_tier || 'medium';

          if (periodEnd && !isNaN(Number(periodEnd))) {
            expiresAt = new Date(Number(periodEnd) * 1000);
          } else {
            expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);
          }
        } else {
          // If canceled, unpaid, past_due, or fully deleted: immediately revoke access and nullify expiration date
          tier = 'none';
          expiresAt = null;
        }

        await pool.query(
          `UPDATE guilds 
           SET subscription_status = $1,
               subscription_expires_at = $2,
               subscription_tier = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE stripe_subscription_id = $4`,
          [status, expiresAt, tier, stripeSubscriptionId]
        );
        console.log(`[Stripe Webhook] Subscription ${stripeSubscriptionId} status updated to ${status}. Tier: ${tier}.`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error(`[Stripe Webhook Error] Failed handling event ${event.type}:`, error);
    return res.status(500).json({ status: 'error', message: 'Internal server error handling webhook' });
  }

  res.json({ received: true });
});

// POST /api/stripe/mock-payment-success : Conserve la compatibilité pour l'activation d'essai gratuit
router.post('/mock-payment-success', requireActiveGuild, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    const { tier } = req.body;

    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild found in session.' });
    }

    // Security check: Only GMs and Officers (rank <= 2) can manage or activate subscriptions!
    const userRes = await pool.query('SELECT rank FROM users WHERE id = $1', [req.user!.id]);
    const userRank = userRes.rows[0]?.rank;
    
    if (userRank === null || userRank === undefined || userRank > 2) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only Guild Masters and Officers are authorized to manage or activate subscriptions.'
      });
    }

    const subscriptionTier = tier === 'pro' ? 'pro' : (tier === 'free' ? 'free' : 'medium');
    const interval = subscriptionTier === 'free' ? '30 days' : '1 year';

    // Mettre à jour la guilde au niveau d'abonnement sélectionné et ajouter la durée correspondante
    const result = await pool.query(
      `UPDATE guilds 
       SET subscription_tier = $1, 
           subscription_expires_at = CURRENT_TIMESTAMP + $2::interval, 
           subscription_status = 'active',
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [subscriptionTier, interval, guildId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Guild not found.' });
    }

    res.json({
      status: 'success',
      message: `Payment completed successfully for ${subscriptionTier} tier (Mocked)`,
      guild: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export default router;
