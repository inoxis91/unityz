export type SubscriptionTier = 'none' | 'free' | 'medium' | 'pro';

export interface TierLimits {
  rosters: number;
  eventsPerMonth: number;
}

/** Quotas par offre (Infinity = illimité). Miroir de backend/src/services/tierLimits.ts. */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  none: { rosters: 1, eventsPerMonth: 3 },
  free: { rosters: 1, eventsPerMonth: 3 },
  medium: { rosters: 2, eventsPerMonth: 6 },
  pro: { rosters: Infinity, eventsPerMonth: Infinity },
};

export function limitsFor(tier: string | null | undefined): TierLimits {
  return TIER_LIMITS[(tier as SubscriptionTier) ?? 'none'] ?? TIER_LIMITS.none;
}
