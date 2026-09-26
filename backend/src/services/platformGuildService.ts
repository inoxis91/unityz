import pool, { withTransaction } from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { PLAN_PRICE_CENTS } from './billingService';

/*
 * Back-office plateforme : seules requêtes du backend qui traversent toutes les guildes, isolées ici
 * et dans platformStatsService.ts. Aucune route de guilde ne doit importer ces services.
 */

export const GUILD_STATES = ['paying', 'canceling', 'past_due', 'comped', 'trial', 'lapsed', 'prospect'] as const;
export type GuildState = (typeof GUILD_STATES)[number];

/** Étapes du tunnel d'une guilde, dans l'ordre. `stage` = index de la plus avancée atteinte. */
export const FUNNEL_STAGES = [
  'created',
  'manager_joined',
  'payment_viewed',
  'offer_activated',
  'engaged',
  'paid',
  'retained',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Guilde qui a encore un abonnement Stripe vivant : son offre et son échéance se gèrent dans Stripe. */
const LIVE_STRIPE_STATES: GuildState[] = ['paying', 'canceling', 'past_due'];

/**
 * État commercial d'une guilde (alias `g`). Payante = offre payante en cours portée par un
 * abonnement Stripe ; offerte = accès en cours sans abonnement (geste commercial, simulateur).
 */
export const GUILD_STATE_SQL = `CASE
  WHEN g.subscription_expires_at > CURRENT_TIMESTAMP AND g.subscription_status = 'past_due' THEN 'past_due'
  WHEN g.subscription_expires_at > CURRENT_TIMESTAMP AND g.subscription_tier IN ('medium', 'pro')
       AND g.stripe_subscription_id IS NOT NULL
    THEN CASE WHEN g.subscription_status = 'canceled' THEN 'canceling' ELSE 'paying' END
  WHEN g.subscription_expires_at > CURRENT_TIMESTAMP AND g.subscription_tier = 'free' THEN 'trial'
  WHEN g.subscription_expires_at > CURRENT_TIMESTAMP THEN 'comped'
  WHEN g.free_trial_used_at IS NOT NULL OR g.stripe_customer_id IS NOT NULL THEN 'lapsed'
  ELSE 'prospect'
END`;

/** MRR d'une guilde (alias `g`, colonne `state`) : payante ou en retard de paiement. */
const MRR_SQL = `CASE WHEN f.state IN ('paying', 'past_due')
  THEN CASE f.subscription_tier WHEN 'medium' THEN ${PLAN_PRICE_CENTS.medium} WHEN 'pro' THEN ${PLAN_PRICE_CENTS.pro} ELSE 0 END
  ELSE 0 END`;

/**
 * Faits calculés par guilde : état, membres, activité, usage, paiements, étape du tunnel.
 * Chaque sous-requête s'appuie sur un index (guild_id) : quelques ms pour des milliers de guildes.
 */
export const GUILD_FACTS_SQL = `
  WITH base AS (
    SELECT g.id, g.name, g.realm, g.region, g.subscription_tier, g.subscription_status,
           g.subscription_expires_at, g.free_trial_used_at, g.created_at,
           g.stripe_subscription_id IS NOT NULL AS has_subscription,
           g.stripe_customer_id IS NOT NULL AS has_customer,
           ${GUILD_STATE_SQL} AS state,
           m.members, m.managers,
           a.last_active_on, a.active_users_7d,
           e.events_total, e.events_30d,
           p.payments_count, p.paid_total_cents,
           pv.payment_viewed,
           COALESCE(n.is_partner, FALSE) AS is_partner
    FROM guilds g
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS members, COUNT(*) FILTER (WHERE rank <= 2)::int AS managers
      FROM guild_members WHERE guild_id = g.id
    ) m ON TRUE
    LEFT JOIN LATERAL (
      SELECT to_char(MAX(day), 'YYYY-MM-DD') AS last_active_on,
             COUNT(DISTINCT user_id) FILTER (WHERE day > CURRENT_DATE - 7)::int AS active_users_7d
      FROM user_activity_days WHERE guild_id = g.id
    ) a ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS events_total,
             COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS events_30d
      FROM events WHERE guild_id = g.id
    ) e ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS payments_count, COALESCE(SUM(amount_cents), 0)::int AS paid_total_cents
      FROM payments WHERE guild_id = g.id
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM analytics_events ae
        WHERE ae.guild_id = g.id AND ae.name = 'payment_viewed' AND ae.props->>'can_manage' = 'true'
      ) AS payment_viewed
    ) pv ON TRUE
    LEFT JOIN platform_guild_notes n ON n.guild_id = g.id
  ),
  facts AS (
    SELECT f.*,
           CASE
             WHEN f.state IN ('paying', 'canceling', 'past_due') THEN 6
             WHEN f.payments_count > 0 OR f.has_subscription THEN 5
             WHEN f.members >= 3 AND f.events_total > 0 THEN 4
             WHEN f.free_trial_used_at IS NOT NULL OR f.has_customer OR f.subscription_expires_at IS NOT NULL THEN 3
             WHEN f.payment_viewed THEN 2
             WHEN f.managers > 0 THEN 1
             ELSE 0
           END AS stage,
           ${MRR_SQL} AS mrr_cents
    FROM base f
  )`;

export interface GuildListQuery {
  search?: string;
  state?: GuildState;
  stage?: number;
  region?: string;
  partner?: boolean;
  sort: 'created' | 'name' | 'activity' | 'members' | 'revenue';
  page: number;
  pageSize: number;
}

const SORT_SQL: Record<GuildListQuery['sort'], string> = {
  created: 'created_at DESC',
  name: 'LOWER(name) ASC',
  activity: 'last_active_on DESC NULLS LAST, created_at DESC',
  members: 'members DESC, created_at DESC',
  revenue: 'paid_total_cents DESC, mrr_cents DESC, created_at DESC',
};

const LIST_COLUMNS = `id, name, realm, region, subscription_tier, subscription_expires_at, created_at,
  state, stage, members, managers, active_users_7d, last_active_on, events_30d,
  paid_total_cents, mrr_cents, is_partner`;

function listFilters(query: Omit<GuildListQuery, 'sort' | 'page' | 'pageSize'>) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.search) {
    params.push(`%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(name ILIKE $${params.length} OR realm ILIKE $${params.length})`);
  }
  if (query.state) {
    params.push(query.state);
    where.push(`state = $${params.length}`);
  }
  if (query.stage !== undefined) {
    params.push(query.stage);
    where.push(`stage = $${params.length}`);
  }
  if (query.region) {
    params.push(query.region);
    where.push(`region = $${params.length}`);
  }
  if (query.partner) where.push('is_partner');
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function listGuilds(query: GuildListQuery) {
  const { whereSql, params } = listFilters(query);
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const { rows } = await pool.query(
    `${GUILD_FACTS_SQL}
     SELECT ${LIST_COLUMNS}, COUNT(*) OVER()::int AS total
     FROM facts ${whereSql}
     ORDER BY ${SORT_SQL[query.sort]}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: rows[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    items: rows.map(({ total: _total, ...row }) => row),
  };
}

const CSV_MAX_ROWS = 10_000;

/** Neutralise les formules (=, +, -, @) qu'un tableur exécuterait à l'ouverture. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportGuildsCsv(query: Omit<GuildListQuery, 'page' | 'pageSize'>): Promise<string> {
  const { whereSql, params } = listFilters(query);
  const { rows } = await pool.query(
    `${GUILD_FACTS_SQL}
     SELECT ${LIST_COLUMNS} FROM facts ${whereSql}
     ORDER BY ${SORT_SQL[query.sort]} LIMIT ${CSV_MAX_ROWS}`,
    params,
  );
  const columns = [
    'id', 'name', 'realm', 'region', 'state', 'stage', 'subscription_tier', 'subscription_expires_at',
    'members', 'managers', 'active_users_7d', 'last_active_on', 'events_30d', 'paid_total_cents',
    'mrr_cents', 'is_partner', 'created_at',
  ];
  const lines = rows.map((row) =>
    columns.map((col) => csvCell(col === 'stage' ? FUNNEL_STAGES[row.stage] : row[col])).join(','),
  );
  return [columns.join(','), ...lines].join('\r\n');
}

function stripeDashboardUrl(kind: 'customers' | 'subscriptions', id: string | null): string | null {
  if (!id || id.startsWith('mock_')) return null;
  const test = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'test/' : '';
  return `https://dashboard.stripe.com/${test}${kind}/${encodeURIComponent(id)}`;
}

export async function getGuildDetail(guildId: string) {
  const { rows: factRows } = await pool.query(`${GUILD_FACTS_SQL} SELECT * FROM facts WHERE id = $1`, [guildId]);
  const facts = factRows[0];
  if (!facts) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');

  const [guild, note, members, usage, timeline] = await Promise.all([
    pool.query(
      `SELECT blizzard_id, stripe_customer_id, stripe_subscription_id, discord_enabled, discord_guild_id,
              discord_locale, fees_enabled, updated_at
       FROM guilds WHERE id = $1`,
      [guildId],
    ),
    pool.query(
      `SELECT n.note, n.is_partner, n.updated_at, u.battletag AS updated_by
       FROM platform_guild_notes n LEFT JOIN users u ON u.id = n.updated_by
       WHERE n.guild_id = $1`,
      [guildId],
    ),
    pool.query(
      `SELECT u.id, u.battletag, gm.role, gm.rank, gm.created_at AS joined_at,
              u.discord_id IS NOT NULL AS discord_linked,
              (SELECT to_char(MAX(day), 'YYYY-MM-DD') FROM user_activity_days a WHERE a.user_id = u.id) AS last_active_on,
              mc.name AS main_name, mc.class AS main_class
       FROM guild_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN LATERAL (
         SELECT name, class FROM characters c
         WHERE c.user_id = u.id AND c.guild_id = gm.guild_id
         ORDER BY c.is_main DESC NULLS LAST, c.created_at LIMIT 1
       ) mc ON TRUE
       WHERE gm.guild_id = $1
       ORDER BY gm.rank ASC NULLS LAST, u.battletag ASC
       LIMIT 500`,
      [guildId],
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM rosters WHERE guild_id = $1)::int AS rosters,
         (SELECT COUNT(*) FROM events WHERE guild_id = $1)::int AS events,
         (SELECT COUNT(*) FROM events WHERE guild_id = $1 AND COALESCE(logs, '') <> '')::int AS wcl_reports,
         (SELECT COUNT(*) FROM event_signups s JOIN events e ON e.id = s.event_id
            WHERE e.guild_id = $1 AND s.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS signups_30d,
         (SELECT COUNT(*) FROM fee_declarations WHERE guild_id = $1)::int AS fee_declarations,
         (SELECT COUNT(*) FROM craft_requests WHERE guild_id = $1)::int AS craft_requests,
         (SELECT COUNT(*) FROM help_posts WHERE guild_id = $1)::int AS help_posts,
         (SELECT COUNT(*) FROM absences WHERE guild_id = $1)::int AS absences,
         (SELECT COUNT(*) FROM characters WHERE guild_id = $1)::int AS characters`,
      [guildId],
    ),
    pool.query(
      `SELECT * FROM (
         SELECT 'event' AS kind, ae.name AS type, ae.occurred_at AS at, u.battletag, ae.props AS data
         FROM analytics_events ae LEFT JOIN users u ON u.id = ae.user_id
         -- Actions du back-office et questionnaires : lignes d'audit et de feedback, plus détaillées
         WHERE ae.guild_id = $1 AND ae.name NOT IN ('platform_action', 'feedback_submitted')
         UNION ALL
         SELECT 'payment', COALESCE(p.billing_reason, 'payment'), p.paid_at, NULL,
                jsonb_build_object('amount_cents', p.amount_cents, 'currency', p.currency, 'tier', p.tier)
         FROM payments p WHERE p.guild_id = $1
         UNION ALL
         SELECT 'feedback', cf.source, cf.created_at, u.battletag,
                jsonb_build_object('reason', cf.reason, 'comment', cf.comment)
         FROM churn_feedback cf LEFT JOIN users u ON u.id = cf.user_id
         WHERE cf.guild_id = $1
         UNION ALL
         SELECT 'audit', pa.action, pa.created_at, pa.actor_battletag, pa.details
         FROM platform_audit_log pa
         WHERE pa.guild_id = $1 AND pa.action <> 'guild_viewed'
         UNION ALL
         SELECT 'milestone', 'guild_created', g.created_at::timestamptz, NULL, '{}'::jsonb
         FROM guilds g WHERE g.id = $1
       ) t
       ORDER BY at DESC
       LIMIT 200`,
      [guildId],
    ),
  ]);

  const g = guild.rows[0];
  return {
    ...facts,
    stage_key: FUNNEL_STAGES[facts.stage],
    blizzard_id: g.blizzard_id,
    discord_enabled: g.discord_enabled,
    discord_linked: !!g.discord_guild_id,
    discord_locale: g.discord_locale,
    fees_enabled: g.fees_enabled,
    stripe_managed: LIVE_STRIPE_STATES.includes(facts.state),
    stripe_customer_url: stripeDashboardUrl('customers', g.stripe_customer_id),
    stripe_subscription_url: stripeDashboardUrl('subscriptions', g.stripe_subscription_id),
    note: note.rows[0] ?? { note: '', is_partner: false, updated_at: null, updated_by: null },
    roster: members.rows,
    usage: usage.rows[0],
    timeline: timeline.rows,
  };
}

export type GuildAction =
  | { type: 'extend_access'; days: number; tier: 'free' | 'medium' | 'pro'; note: string }
  | { type: 'reset_trial'; note: string }
  | { type: 'revoke_access'; note: string };

/**
 * Gestes commerciaux sur une guilde, sous verrou de ligne. Une guilde avec un abonnement Stripe
 * vivant garde l'offre que Stripe facture : seule la prolongation de l'accès est permise.
 */
export async function applyGuildAction(guildId: string, action: GuildAction) {
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT g.id, g.subscription_tier, g.subscription_expires_at, g.free_trial_used_at,
              ${GUILD_STATE_SQL} AS state
       FROM guilds g WHERE g.id = $1 FOR UPDATE`,
      [guildId],
    );
    const before = rows[0];
    if (!before) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');
    const stripeManaged = LIVE_STRIPE_STATES.includes(before.state);

    let updated;
    switch (action.type) {
      case 'extend_access': {
        if (stripeManaged && action.tier !== before.subscription_tier) {
          throw new HttpError(409, 'The plan of a Stripe subscription is changed in Stripe.', 'STRIPE_MANAGED');
        }
        ({ rows: [updated] } = await db.query(
          `UPDATE guilds
           SET subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
                                         + make_interval(days => $2::int),
               subscription_tier = $3,
               subscription_status = CASE WHEN $4::boolean THEN subscription_status ELSE 'active' END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING subscription_tier, subscription_expires_at`,
          [guildId, action.days, action.tier, stripeManaged],
        ));
        break;
      }
      case 'reset_trial': {
        if (!before.free_trial_used_at) {
          throw new HttpError(409, 'The free trial is still available.', 'TRIAL_AVAILABLE');
        }
        ({ rows: [updated] } = await db.query(
          `UPDATE guilds SET free_trial_used_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 RETURNING free_trial_used_at`,
          [guildId],
        ));
        break;
      }
      case 'revoke_access': {
        if (stripeManaged) {
          throw new HttpError(409, 'Cancel the Stripe subscription first.', 'STRIPE_MANAGED');
        }
        ({ rows: [updated] } = await db.query(
          `UPDATE guilds
           SET subscription_expires_at = NULL, subscription_tier = 'none', subscription_status = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 RETURNING subscription_tier, subscription_expires_at`,
          [guildId],
        ));
        break;
      }
    }

    return {
      before: {
        subscription_tier: before.subscription_tier,
        subscription_expires_at: before.subscription_expires_at,
        free_trial_used_at: before.free_trial_used_at,
      },
      after: updated,
    };
  });
}

export async function saveGuildNote(guildId: string, userId: string, note: string, isPartner: boolean) {
  const { rows } = await pool.query(
    `INSERT INTO platform_guild_notes (guild_id, note, is_partner, updated_by)
     SELECT id, $2, $3, $4 FROM guilds WHERE id = $1
     ON CONFLICT (guild_id) DO UPDATE
       SET note = EXCLUDED.note, is_partner = EXCLUDED.is_partner, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING note, is_partner, updated_at`,
    [guildId, note, isPartner, userId],
  );
  if (!rows[0]) throw new HttpError(404, 'Guild not found.', 'GUILD_NOT_FOUND');
  return rows[0];
}

export async function listAudit(page: number, pageSize: number) {
  const { rows } = await pool.query(
    `SELECT pa.id, pa.created_at, pa.actor_battletag, pa.action, pa.guild_id, g.name AS guild_name,
            pa.details, COUNT(*) OVER()::int AS total
     FROM platform_audit_log pa
     LEFT JOIN guilds g ON g.id = pa.guild_id
     ORDER BY pa.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  return {
    total: rows[0]?.total ?? 0,
    page,
    pageSize,
    items: rows.map(({ total: _total, ...row }) => row),
  };
}
