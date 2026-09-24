import { PoolClient } from 'pg';
import { HttpError } from '../middlewares/errorHandler';

export type SubscriptionTier = 'none' | 'free' | 'medium' | 'pro';

interface TierLimits {
  rosters: number;
  eventsPerMonth: number;
}

/** Quotas par offre (Infinity = illimité). Miroir de frontend/src/app/constants/tiers.ts. */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  none: { rosters: 1, eventsPerMonth: 3 },
  free: { rosters: 1, eventsPerMonth: 3 },
  medium: { rosters: 2, eventsPerMonth: 6 },
  pro: { rosters: Infinity, eventsPerMonth: Infinity },
};

export function limitsFor(tier: string | null | undefined): TierLimits {
  return TIER_LIMITS[(tier as SubscriptionTier) ?? 'none'] ?? TIER_LIMITS.none;
}

/**
 * Verrouille la ligne de la guilde jusqu'à la fin de la transaction : deux créations simultanées
 * ne peuvent pas dépasser le quota en lisant le même compteur.
 */
async function lockGuildTier(client: PoolClient, guildId: string): Promise<TierLimits> {
  const res = await client.query('SELECT subscription_tier FROM guilds WHERE id = $1 FOR UPDATE', [
    guildId,
  ]);
  if (!res.rows[0]) throw new HttpError(404, 'Guild not found', 'GUILD_NOT_FOUND');
  return limitsFor(res.rows[0].subscription_tier);
}

export async function assertRosterQuota(client: PoolClient, guildId: string): Promise<void> {
  const { rosters } = await lockGuildTier(client, guildId);
  if (!Number.isFinite(rosters)) return;
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM rosters WHERE guild_id = $1', [
    guildId,
  ]);
  if (rows[0].count >= rosters) {
    throw new HttpError(
      403,
      `Your subscription allows ${rosters} roster(s). Upgrade to create more.`,
      'ROSTER_LIMIT_REACHED',
    );
  }
}

export async function assertEventQuota(
  client: PoolClient,
  guildId: string,
  startTime: string,
): Promise<void> {
  const { eventsPerMonth } = await lockGuildTier(client, guildId);
  if (!Number.isFinite(eventsPerMonth)) return;
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count FROM events
     WHERE guild_id = $1 AND DATE_TRUNC('month', start_time) = DATE_TRUNC('month', $2::timestamp)`,
    [guildId, startTime],
  );
  if (rows[0].count >= eventsPerMonth) {
    throw new HttpError(
      403,
      `Your subscription allows ${eventsPerMonth} events per month. Upgrade to create more.`,
      'EVENT_LIMIT_REACHED',
    );
  }
}
