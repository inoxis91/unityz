import { TIER_LIMITS, type SubscriptionTier } from './tiers';

export type PlanTier = Exclude<SubscriptionTier, 'none'>;
export type PlanFeatureStatus = 'yes' | 'limit' | 'no';

export interface PlanFeature {
  /** i18n key; `{n}` is replaced by `count` when set. */
  key: string;
  status: PlanFeatureStatus;
  count?: number;
}

export interface Plan {
  tier: PlanTier;
  /** Price in euro cents, billed every `period`. Mirrors backend/src/routes/stripe.ts. */
  priceCents: number;
  period: 'trial' | 'month';
  highlighted: boolean;
}

export const PLANS: readonly Plan[] = [
  { tier: 'free', priceCents: 0, period: 'trial', highlighted: false },
  { tier: 'medium', priceCents: 299, period: 'month', highlighted: false },
  { tier: 'pro', priceCents: 499, period: 'month', highlighted: true },
];

/** Features every plan includes: only quotas and the Discord bot differ between tiers. */
const INCLUDED_KEYS = [
  'plans.feat.calendar',
  'plans.feat.logs',
  'plans.feat.mplus',
  'plans.feat.guild_tools',
] as const;

export function planFeatures(tier: PlanTier): PlanFeature[] {
  const { rosters, eventsPerMonth } = TIER_LIMITS[tier];
  const quota = (limit: number, limitedKey: string, unlimitedKey: string): PlanFeature =>
    Number.isFinite(limit)
      ? { key: limitedKey, status: 'limit', count: limit }
      : { key: unlimitedKey, status: 'yes' };

  return [
    ...INCLUDED_KEYS.map((key): PlanFeature => ({ key, status: 'yes' })),
    quota(
      rosters,
      rosters === 1 ? 'plans.feat.roster_one' : 'plans.feat.rosters',
      'plans.feat.rosters_unlimited',
    ),
    quota(eventsPerMonth, 'plans.feat.events', 'plans.feat.events_unlimited'),
    { key: 'plans.feat.discord', status: tier === 'pro' ? 'yes' : 'no' },
  ];
}

/** "4,99 €" / "4.99 €" depending on the locale. */
export function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents === 0 ? 0 : 2,
  }).format(cents / 100);
}
