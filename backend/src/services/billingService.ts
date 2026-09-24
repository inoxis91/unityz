import Stripe from 'stripe';
import pool, { withTransaction } from '../lib/db';
import { isProd } from '../lib/env';
import { HttpError } from '../middlewares/errorHandler';

export type StripeInstance = InstanceType<typeof Stripe>;
export type CheckoutSession = Awaited<ReturnType<StripeInstance['checkout']['sessions']['retrieve']>>;
export type StripeInvoice = Awaited<ReturnType<StripeInstance['invoices']['retrieve']>>;
export type StripeSubscription = Awaited<ReturnType<StripeInstance['subscriptions']['retrieve']>>;

export const PAID_TIERS = ['medium', 'pro'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

/** Jours d'accès conservés quand un renouvellement échoue, le temps de régulariser. */
export const PAST_DUE_GRACE_DAYS = 7;

/** Catalogue mensuel. Les prix Stripe sont retrouvés (ou créés) par `lookup_key`. */
const PLAN_CATALOG: Record<PaidTier, { amount: number; name: string; description: string }> = {
  medium: {
    amount: 299,
    name: 'Guild Manager - Standard Subscription',
    description: 'Accès standard aux fonctionnalités de la guilde et gestion de cotisations.',
  },
  pro: {
    amount: 499,
    name: 'Guild Manager - Pro Subscription',
    description:
      'Accès complet aux fonctionnalités de la guilde, synchronisation Discord complète, et gestion de cotisations Pro.',
  },
};

const lookupKey = (tier: PaidTier) => `guild_manager_${tier}_monthly`;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
export const stripe: StripeInstance | null = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
console.log(
  stripe
    ? '[Stripe] Successfully initialized Stripe client.'
    : '[Stripe] STRIPE_SECRET_KEY not set. Operating in MOCK / SIMULATOR mode.',
);

/** Simulateur de paiement : uniquement hors production et sans clé Stripe. */
export const mockPaymentsEnabled = () => !stripe && !isProd;

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === 'string' && (PAID_TIERS as readonly string[]).includes(value);
}

function requireStripe(): StripeInstance {
  if (!stripe) throw new HttpError(503, 'Payments are not configured.', 'PAYMENTS_UNAVAILABLE');
  return stripe;
}

function oneMonthFromNow(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date;
}

const idOf = (value: string | { id: string } | null): string | null =>
  !value ? null : typeof value === 'string' ? value : value.id;

const isMissing = (err: unknown) => (err as { code?: string }).code === 'resource_missing';

/**
 * Fin de la période payée. Depuis l'API 2025-03-31 (basil), `current_period_end` est porté par les
 * items de l'abonnement et non plus par l'abonnement lui-même.
 */
export function subscriptionPeriodEnd(subscription: StripeSubscription): Date {
  const ends = subscription.items.data.map((item) => item.current_period_end).filter(Number.isFinite);
  return ends.length ? new Date(Math.max(...ends) * 1000) : oneMonthFromNow();
}

/** Abonnement d'une facture : `invoice.subscription` a été déplacé sous `parent.subscription_details`. */
export function invoiceSubscriptionId(invoice: StripeInvoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

/** Offre d'un abonnement d'après son prix (catalogue), sinon ses métadonnées (anciens prix inline). */
export function tierOfSubscription(subscription: StripeSubscription): PaidTier | null {
  const key = subscription.items.data[0]?.price.lookup_key;
  const fromPrice = PAID_TIERS.find((tier) => lookupKey(tier) === key);
  if (fromPrice) return fromPrice;
  return isPaidTier(subscription.metadata?.tier) ? subscription.metadata.tier : null;
}

const priceIds = new Map<PaidTier, Promise<string>>();

/** Prix mensuel actif de l'offre, créé au premier appel s'il n'existe pas encore dans le compte. */
function tierPrice(client: StripeInstance, tier: PaidTier): Promise<string> {
  let price = priceIds.get(tier);
  if (!price) {
    price = (async () => {
      const key = lookupKey(tier);
      const existing = await client.prices.list({ lookup_keys: [key], active: true, limit: 1 });
      if (existing.data[0]) return existing.data[0].id;
      const { amount, name, description } = PLAN_CATALOG[tier];
      const created = await client.prices.create({
        currency: 'eur',
        unit_amount: amount,
        recurring: { interval: 'month' },
        product_data: { name, metadata: { description } },
        lookup_key: key,
        transfer_lookup_key: true,
      });
      console.log(`[Stripe] Created price ${created.id} for tier ${tier}.`);
      return created.id;
    })();
    priceIds.set(tier, price);
    price.catch(() => priceIds.delete(tier));
  }
  return price;
}

/**
 * Client Stripe réutilisable pour une nouvelle session, sinon null (client supprimé, ou créé avec
 * une autre clé test/live) : le passer tel quel ferait échouer Checkout à chaque tentative.
 */
async function reusableCustomerId(client: StripeInstance, guildId: string, customerId: string | null) {
  if (!customerId) return null;
  try {
    const customer = await client.customers.retrieve(customerId);
    if (!customer.deleted) return customerId;
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  console.warn(`[Stripe] Customer ${customerId} of guild ${guildId} no longer exists, a new one will be created.`);
  await pool.query('UPDATE guilds SET stripe_customer_id = NULL WHERE id = $1', [guildId]);
  return null;
}

/** Abonnement Stripe encore en vie de la guilde (actif, en essai ou en retard de paiement). */
async function liveSubscription(client: StripeInstance, subscriptionId: string | null) {
  if (!subscriptionId) return null;
  try {
    const subscription = await client.subscriptions.retrieve(subscriptionId);
    return ['active', 'trialing', 'past_due'].includes(subscription.status) ? subscription : null;
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

async function guildBilling(guildId: string) {
  const { rows } = await pool.query(
    'SELECT stripe_customer_id, stripe_subscription_id, subscription_tier FROM guilds WHERE id = $1',
    [guildId],
  );
  if (!rows[0]) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');
  return rows[0] as { stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_tier: string };
}

export async function createCheckoutSession(guildId: string, tier: PaidTier): Promise<string> {
  if (mockPaymentsEnabled()) {
    const mockSessionId = `mock_cs_${Math.random().toString(36).substring(2, 15)}`;
    return `/payment?session_id=${mockSessionId}&guild_id=${guildId}&tier=${tier}`;
  }
  const client = requireStripe();
  const guild = await guildBilling(guildId);

  // Un second abonnement facturerait la guilde deux fois : on passe par le changement d'offre
  const current = await liveSubscription(client, guild.stripe_subscription_id);
  if (current?.status === 'past_due') {
    throw new HttpError(409, 'The last payment failed, settle the pending invoice first.', 'PAYMENT_PAST_DUE');
  }
  if (current) {
    throw new HttpError(409, 'This guild already has an active subscription.', 'ACTIVE_SUBSCRIPTION');
  }

  const customer = await reusableCustomerId(client, guildId, guild.stripe_customer_id);
  const metadata = { guild_id: guildId, tier };
  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: await tierPrice(client, tier), quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    customer: customer ?? undefined,
    success_url: `${process.env.FRONTEND_URL}/payment?session_id={CHECKOUT_SESSION_ID}&guild_id=${guildId}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment?canceled=1`,
  });
  if (!session.url) throw new HttpError(502, 'Stripe did not return a checkout URL.', 'CHECKOUT_UNAVAILABLE');
  return session.url;
}

/**
 * Active l'offre d'une session Checkout payée (retour de Stripe et webhook, idempotent). Un
 * ancien abonnement différent est résilié pour ne pas facturer deux fois.
 */
export async function activateCheckoutSession(client: StripeInstance, session: CheckoutSession) {
  const guildId = session.metadata?.guild_id;
  const tier = session.metadata?.tier;
  if (!guildId || !isPaidTier(tier)) {
    throw new HttpError(400, 'Checkout session without a valid guild or tier.', 'INVALID_SESSION');
  }
  const stripeCustomerId = idOf(session.customer);
  const stripeSubscriptionId = idOf(session.subscription);

  let expiresAt = oneMonthFromNow();
  if (stripeSubscriptionId) {
    try {
      expiresAt = subscriptionPeriodEnd(await client.subscriptions.retrieve(stripeSubscriptionId));
    } catch (err) {
      console.error('[Stripe] Error retrieving subscription details. Using 1-month fallback:', err);
    }
  }

  const { stripe_subscription_id: oldSubscriptionId } = await guildBilling(guildId);
  if (oldSubscriptionId && stripeSubscriptionId && oldSubscriptionId !== stripeSubscriptionId) {
    try {
      console.log(`[Stripe] Cancelling old subscription ${oldSubscriptionId} in favor of ${stripeSubscriptionId}.`);
      await client.subscriptions.cancel(oldSubscriptionId);
    } catch (err) {
      if (!isMissing(err)) console.error('[Stripe] Error cancelling old subscription:', err);
    }
  }

  const result = await pool.query(
    `UPDATE guilds
     SET subscription_tier = $1,
         subscription_expires_at = $2,
         stripe_customer_id = $3,
         stripe_subscription_id = $4,
         subscription_status = 'active',
         free_trial_used_at = COALESCE(free_trial_used_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [tier, expiresAt, stripeCustomerId, stripeSubscriptionId, guildId],
  );
  return { tier, expiresAt, guild: result.rows[0] };
}

/** Abonnement actif qu'un changement d'offre peut modifier, sinon une erreur explicite. */
async function changeableSubscription(client: StripeInstance, subscriptionId: string | null) {
  const subscription = await liveSubscription(client, subscriptionId);
  if (!subscription) {
    throw new HttpError(409, 'No active subscription to change, subscribe first.', 'NO_ACTIVE_SUBSCRIPTION');
  }
  if (subscription.status === 'past_due') {
    throw new HttpError(409, 'The last payment failed, settle the pending invoice first.', 'PAYMENT_PAST_DUE');
  }
  return subscription;
}

/** Montant facturé tout de suite pour passer à `tier` (négatif : crédit sur les prochaines factures). */
export async function previewPlanChange(guildId: string, tier: PaidTier) {
  const client = requireStripe();
  const guild = await guildBilling(guildId);
  const subscription = await changeableSubscription(client, guild.stripe_subscription_id);
  if (tierOfSubscription(subscription) === tier && !subscription.cancel_at_period_end) {
    throw new HttpError(409, 'The guild is already on this plan.', 'SAME_PLAN');
  }
  const preview = await client.invoices.createPreview({
    subscription: subscription.id,
    subscription_details: {
      items: [{ id: subscription.items.data[0].id, price: await tierPrice(client, tier) }],
      proration_behavior: 'always_invoice',
    },
  });
  return { amount: preview.total, currency: preview.currency, periodEnd: subscriptionPeriodEnd(subscription) };
}

/**
 * Change l'offre de l'abonnement en cours au prorata : la différence est facturée immédiatement
 * (ou créditée en cas de baisse). Si le paiement échoue, Stripe n'applique pas le changement.
 */
export async function changePlan(guildId: string, tier: PaidTier) {
  if (mockPaymentsEnabled()) {
    const { rows } = await pool.query(
      `UPDATE guilds SET subscription_tier = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND subscription_expires_at > CURRENT_TIMESTAMP RETURNING *`,
      [tier, guildId],
    );
    if (!rows[0]) throw new HttpError(409, 'No active subscription to change.', 'NO_ACTIVE_SUBSCRIPTION');
    return rows[0];
  }
  const client = requireStripe();

  // Verrou sur la guilde : deux clics simultanés ne lancent pas deux changements facturés
  return withTransaction(async (db) => {
    const { rows } = await db.query('SELECT stripe_subscription_id FROM guilds WHERE id = $1 FOR UPDATE', [guildId]);
    if (!rows[0]) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');
    const subscription = await changeableSubscription(client, rows[0].stripe_subscription_id);
    if (tierOfSubscription(subscription) === tier && !subscription.cancel_at_period_end) {
      throw new HttpError(409, 'The guild is already on this plan.', 'SAME_PLAN');
    }

    let updated: StripeSubscription;
    try {
      updated = await client.subscriptions.update(subscription.id, {
        items: [{ id: subscription.items.data[0].id, price: await tierPrice(client, tier) }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
      });
    } catch (err) {
      if ((err as { type?: string }).type !== 'StripeCardError') throw err;
      updated = { pending_update: {} } as StripeSubscription;
    }
    if (updated.pending_update) {
      // Sans ça, Stripe pourrait encaisser la facture plus tard et appliquer la hausse en différé
      await voidOpenInvoice(client, subscription.id);
      throw new HttpError(402, 'The prorated payment failed, the plan was not changed.', 'PAYMENT_FAILED');
    }
    // Changer d'offre annule une résiliation programmée (paramètres refusés avec pending_if_incomplete)
    updated = await client.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      metadata: { guild_id: guildId, tier },
    });

    const result = await db.query(
      `UPDATE guilds
       SET subscription_tier = $1,
           subscription_expires_at = $2,
           subscription_status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [tier, subscriptionPeriodEnd(updated), guildId],
    );
    console.log(`[Stripe] Guild ${guildId} switched to ${tier} (subscription ${subscription.id}).`);
    return result.rows[0];
  });
}

async function voidOpenInvoice(client: StripeInstance, subscriptionId: string) {
  const open = await client.invoices.list({ subscription: subscriptionId, status: 'open', limit: 5 });
  for (const invoice of open.data) {
    if (invoice.id) await client.invoices.voidInvoice(invoice.id);
  }
}

/** Lien de la facture impayée (page hébergée Stripe, permet aussi de changer de carte). */
export async function pendingInvoiceUrl(guildId: string): Promise<string> {
  const client = requireStripe();
  const guild = await guildBilling(guildId);
  if (!guild.stripe_subscription_id) throw new HttpError(404, 'No subscription for this guild.', 'NO_PENDING_INVOICE');
  const subscription = await client.subscriptions.retrieve(guild.stripe_subscription_id, {
    expand: ['latest_invoice'],
  });
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === 'string' || invoice.status !== 'open' || !invoice.hosted_invoice_url) {
    throw new HttpError(404, 'No pending invoice for this guild.', 'NO_PENDING_INVOICE');
  }
  return invoice.hosted_invoice_url;
}

/** Renouvellement ou régularisation payés : l'accès court jusqu'à la fin de la nouvelle période. */
export async function applyInvoicePaid(client: StripeInstance, invoice: StripeInvoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  let expiresAt = oneMonthFromNow();
  try {
    expiresAt = subscriptionPeriodEnd(await client.subscriptions.retrieve(subscriptionId));
  } catch (err) {
    console.error('[Stripe Webhook] Failed to retrieve subscription for invoice. Using 1-month fallback:', err);
  }
  await pool.query(
    `UPDATE guilds
     SET subscription_expires_at = $1,
         subscription_status = CASE WHEN subscription_status = 'canceled' THEN 'canceled' ELSE 'active' END,
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $2`,
    [expiresAt, subscriptionId],
  );
  console.log(`[Stripe Webhook] Subscription ${subscriptionId} paid until ${expiresAt.toISOString()}.`);
}

/** Synchronise la guilde sur un événement customer.subscription.updated / deleted. */
export async function applySubscriptionChange(subscription: StripeSubscription, deleted: boolean) {
  const { id, status } = subscription;

  // Checkout crée l'abonnement « incomplete » avant le paiement : un événement arrivé en retard
  // ne doit pas révoquer l'accès que checkout.session.completed vient d'ouvrir
  if (!deleted && status === 'incomplete') return;

  if (!deleted && (status === 'active' || status === 'trialing')) {
    // L'échéance n'avance qu'avec une facture payée (invoice.payment_succeeded) : au renouvellement,
    // Stripe annonce la nouvelle période avant même de tenter le prélèvement.
    // Résiliation programmée : l'accès reste ouvert jusqu'à la fin de la période payée
    await pool.query(
      `UPDATE guilds
       SET subscription_status = $1,
           subscription_tier = COALESCE($2, subscription_tier),
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $3`,
      [subscription.cancel_at_period_end ? 'canceled' : status, tierOfSubscription(subscription), id],
    );
  } else if (!deleted && status === 'past_due') {
    // Délai de grâce ouvert au premier échec seulement : les relances Stripe ne le prolongent pas
    await pool.query(
      `UPDATE guilds
       SET subscription_expires_at = CASE
             WHEN subscription_status = 'past_due' THEN subscription_expires_at
             ELSE GREATEST(COALESCE(subscription_expires_at, CURRENT_TIMESTAMP),
                           CURRENT_TIMESTAMP + make_interval(days => $1))
           END,
           subscription_status = 'past_due',
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $2`,
      [PAST_DUE_GRACE_DAYS, id],
    );
  } else {
    // Supprimé, résilié, impayé après toutes les relances : l'accès est coupé
    await pool.query(
      `UPDATE guilds
       SET subscription_status = $1,
           subscription_expires_at = NULL,
           subscription_tier = 'none',
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $2`,
      [deleted ? 'canceled' : status, id],
    );
  }
  console.log(`[Stripe Webhook] Subscription ${id} is now ${deleted ? 'deleted' : status}.`);
}

/** Essai gratuit de 30 jours, une seule fois par guilde et jamais par-dessus une offre payée en cours. */
export async function activateFreeTrial(guildId: string) {
  const { rows } = await pool.query(
    `UPDATE guilds
     SET subscription_tier = 'free',
         subscription_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days',
         subscription_status = 'active',
         free_trial_used_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND free_trial_used_at IS NULL
       AND (subscription_expires_at IS NULL OR subscription_expires_at < CURRENT_TIMESTAMP)
     RETURNING *`,
    [guildId],
  );
  if (rows[0]) return rows[0];

  const { rows: current } = await pool.query('SELECT free_trial_used_at FROM guilds WHERE id = $1', [guildId]);
  if (!current[0]) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');
  if (current[0].free_trial_used_at) {
    throw new HttpError(409, 'The free trial has already been used by this guild.', 'TRIAL_ALREADY_USED');
  }
  throw new HttpError(409, 'A paid subscription is still active for this guild.', 'ACTIVE_SUBSCRIPTION');
}
