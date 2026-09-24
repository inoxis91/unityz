import express, { NextFunction, Request, Response } from 'express';
import { requireActiveGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import pool from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { checkoutSessionSchema, paidTierBodySchema } from '../schemas/billingSchemas';
import {
  CheckoutSession,
  StripeInvoice,
  StripeSubscription,
  activateCheckoutSession,
  activateFreeTrial,
  applyInvoicePaid,
  applySubscriptionChange,
  changePlan,
  createCheckoutSession,
  mockPaymentsEnabled,
  pendingInvoiceUrl,
  previewPlanChange,
  stripe,
} from '../services/billingService';

const router = express.Router();

/** Seuls le GM et les officiers (rang <= 2) gèrent l'abonnement de la guilde. */
async function requireSubscriptionManager(req: Request, res: Response, next: NextFunction) {
  try {
    // Rang en jeu dans la guilde active (0 = GM, 1-2 = officiers)
    const userRes = await pool.query(
      'SELECT rank FROM guild_members WHERE user_id = $1 AND guild_id = $2',
      [req.user!.id, req.user!.active_guild_id],
    );
    const userRank = userRes.rows[0]?.rank;
    if (userRank === null || userRank === undefined || userRank > 2) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only Guild Masters and Officers are authorized to manage subscriptions.',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

const manager = [requireActiveGuild, requireSubscriptionManager];

// POST /api/stripe/create-checkout-session : première souscription payante (Stripe Checkout)
router.post('/create-checkout-session', ...manager, validate(paidTierBodySchema), async (req, res, next) => {
  try {
    res.json({ url: await createCheckoutSession(req.user!.active_guild_id!, req.body.tier) });
  } catch (error) {
    next(error);
  }
});

// POST /api/stripe/change-plan/preview : montant proratisé d'un changement d'offre
router.post('/change-plan/preview', ...manager, validate(paidTierBodySchema), async (req, res, next) => {
  try {
    res.json(await previewPlanChange(req.user!.active_guild_id!, req.body.tier));
  } catch (error) {
    next(error);
  }
});

// POST /api/stripe/change-plan : change l'offre de l'abonnement en cours, au prorata
router.post('/change-plan', ...manager, validate(paidTierBodySchema), async (req, res, next) => {
  try {
    res.json({ status: 'success', guild: await changePlan(req.user!.active_guild_id!, req.body.tier) });
  } catch (error) {
    next(error);
  }
});

// GET /api/stripe/pending-invoice : lien de paiement de la facture en retard
router.get('/pending-invoice', ...manager, async (req, res, next) => {
  try {
    res.json({ url: await pendingInvoiceUrl(req.user!.active_guild_id!) });
  } catch (error) {
    next(error);
  }
});

// GET /api/stripe/checkout-session/:sessionId : valide la session au retour de Stripe
router.get('/checkout-session/:sessionId', ...manager, validate(checkoutSessionSchema), async (req, res, next) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    const guildId = req.user!.active_guild_id!;

    // Session simulée : jamais acceptée en production ni quand Stripe est configuré
    if (sessionId.startsWith('mock_')) {
      if (!mockPaymentsEnabled()) {
        throw new HttpError(400, 'Invalid checkout session.', 'INVALID_SESSION');
      }
      const tier = String(req.query.tier || 'pro');
      const result = await pool.query(
        `UPDATE guilds
         SET subscription_tier = $1,
             subscription_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days',
             subscription_status = 'active',
             free_trial_used_at = COALESCE(free_trial_used_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [tier, guildId],
      );
      if (!result.rows[0]) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');
      return res.json({ status: 'success', tier, guild: result.rows[0] });
    }

    if (!stripe) throw new HttpError(400, 'Invalid checkout session.', 'INVALID_SESSION');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' || session.metadata?.guild_id !== guildId) {
      throw new HttpError(400, 'Payment not completed or guild ID mismatch.', 'PAYMENT_NOT_COMPLETED');
    }
    const { tier, expiresAt, guild } = await activateCheckoutSession(stripe, session);
    res.json({ status: 'success', tier, expiresAt, guild });
  } catch (error) {
    next(error);
  }
});

// POST /api/stripe/webhook : événements Stripe (signature vérifiée sur le corps brut)
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
    event = stripe.webhooks.constructEvent((req as any).rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as CheckoutSession;
        if (session.metadata?.guild_id && session.payment_status === 'paid') {
          try {
            const { tier } = await activateCheckoutSession(stripe, session);
            console.log(`[Stripe Webhook] Guild ${session.metadata.guild_id} subscription activated for tier ${tier}.`);
          } catch (err) {
            // Métadonnées invalides : inutile de laisser Stripe renvoyer l'événement
            if (!(err instanceof HttpError)) throw err;
            console.warn(`[Stripe Webhook] Ignored checkout session ${session.id}: ${err.message}`);
          }
        }
        break;
      }
      case 'invoice.payment_succeeded':
        await applyInvoicePaid(stripe, event.data.object as StripeInvoice);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscriptionChange(
          event.data.object as StripeSubscription,
          event.type === 'customer.subscription.deleted',
        );
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Failed handling event ${event.type}:`, error);
    return res.status(500).json({ status: 'error', message: 'Internal server error handling webhook' });
  }

  res.json({ received: true });
});

// POST /api/stripe/activate-free : essai gratuit de 30 jours, une seule fois par guilde
router.post('/activate-free', ...manager, async (req, res, next) => {
  try {
    res.json({ status: 'success', guild: await activateFreeTrial(req.user!.active_guild_id!) });
  } catch (error) {
    next(error);
  }
});

// POST /api/stripe/cancel-subscription : résiliation à la fin de la période payée
router.post('/cancel-subscription', ...manager, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const guildRes = await pool.query('SELECT stripe_subscription_id FROM guilds WHERE id = $1', [guildId]);
    if (!guildRes.rows[0]) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');

    const stripeSubscriptionId = guildRes.rows[0].stripe_subscription_id;
    if (stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
      } catch (err) {
        console.error('[Stripe Cancel] Error canceling subscription on Stripe:', err);
        // Continue to cancel in DB as a fallback
      }
    }

    // Tier and expiry are kept: access stays open until the end of the paid period
    const result = await pool.query(
      `UPDATE guilds
       SET subscription_status = 'canceled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [guildId],
    );
    res.json({ status: 'success', message: 'Subscription successfully canceled', guild: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
