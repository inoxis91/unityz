import pool from '../lib/db';
import discordClient from '../lib/discord';
import { cronRuns } from '../lib/cronRuns';
import { PLAN_PRICE_CENTS as PRICE, stripe } from './billingService';
import { FUNNEL_STAGES, GUILD_FACTS_SQL, GUILD_STATES, GUILD_STATE_SQL } from './platformGuildService';

/*
 * Statistiques du back-office. Les jours sont ceux de la base (CURRENT_DATE), comme
 * user_activity_days. Les compteurs historiques viennent des tables métier (created_at, essai,
 * abonnements) ; les étapes fines (page d'offres, Checkout, raisons) viennent d'analytics_events.
 */

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** Date de début d'une période de `days` jours se terminant aujourd'hui (incluse). */
const periodStart = (days: number) => `CURRENT_DATE - ${days - 1}`;

export async function getOverview(days: number) {
  const start = periodStart(days);
  const previousStart = `CURRENT_DATE - ${2 * days - 1}`;

  const [states, totals, series, recent] = await Promise.all([
    pool.query(`SELECT ${GUILD_STATE_SQL} AS state, g.subscription_tier AS tier, COUNT(*)::int AS count
                FROM guilds g GROUP BY 1, 2`),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users)::int AS users,
         (SELECT COUNT(*) FROM guilds)::int AS guilds,
         (SELECT COUNT(*) FROM users WHERE created_at::date >= ${start})::int AS new_users,
         (SELECT COUNT(*) FROM users WHERE created_at::date >= ${previousStart} AND created_at::date < ${start})::int AS new_users_prev,
         (SELECT COUNT(*) FROM guilds WHERE created_at::date >= ${start})::int AS new_guilds,
         (SELECT COUNT(*) FROM guilds WHERE created_at::date >= ${previousStart} AND created_at::date < ${start})::int AS new_guilds_prev,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE paid_at::date >= ${start})::int AS revenue_cents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE paid_at::date >= ${previousStart} AND paid_at::date < ${start})::int AS revenue_prev_cents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments)::int AS revenue_total_cents,
         (SELECT COUNT(*) FROM user_activity_days WHERE day = CURRENT_DATE)::int AS dau,
         (SELECT COUNT(DISTINCT user_id) FROM user_activity_days WHERE day > CURRENT_DATE - 7)::int AS wau,
         (SELECT COUNT(DISTINCT user_id) FROM user_activity_days WHERE day > CURRENT_DATE - 30)::int AS mau,
         (SELECT COUNT(DISTINCT guild_id) FROM user_activity_days WHERE day > CURRENT_DATE - 7)::int AS active_guilds_7d,
         (SELECT COUNT(*) FROM guilds WHERE free_trial_used_at IS NOT NULL)::int AS trials_used,
         (SELECT COUNT(*) FROM guilds g WHERE g.free_trial_used_at IS NOT NULL
            AND (g.stripe_subscription_id IS NOT NULL OR EXISTS (SELECT 1 FROM payments p WHERE p.guild_id = g.id)))::int AS trials_converted,
         (SELECT COUNT(*) FROM analytics_events WHERE name = 'subscription_ended' AND occurred_at::date >= ${start})::int AS churned,
         (SELECT COUNT(*) FROM analytics_events WHERE name = 'checkout_completed' AND occurred_at::date >= ${start})::int AS new_subscriptions,
         (SELECT MIN(occurred_at) FROM analytics_events) AS tracking_since`,
    ),
    pool.query(
      `WITH d AS (SELECT generate_series(${start}, CURRENT_DATE, INTERVAL '1 day')::date AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*) FROM users u WHERE u.created_at::date = d.day)::int AS new_users,
         (SELECT COUNT(*) FROM guilds g WHERE g.created_at::date = d.day)::int AS new_guilds,
         (SELECT COUNT(*) FROM guilds g WHERE g.free_trial_used_at::date = d.day)::int AS offers_activated,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments p WHERE p.paid_at::date = d.day)::int AS revenue_cents,
         (SELECT COUNT(*) FROM user_activity_days a WHERE a.day = d.day)::int AS active_users
       FROM d ORDER BY d.day`,
    ),
    pool.query(
      `SELECT ae.name AS type, ae.occurred_at AS at, ae.props AS data, g.id AS guild_id, g.name AS guild_name
       FROM analytics_events ae
       JOIN guilds g ON g.id = ae.guild_id
       WHERE ae.name IN ('checkout_completed', 'free_trial_activated', 'subscription_ended', 'payment_failed',
                         'subscription_cancel_requested', 'plan_changed', 'feedback_submitted', 'guild_selected')
         AND (ae.name <> 'guild_selected' OR ae.props->>'created' = 'true')
       ORDER BY ae.occurred_at DESC
       LIMIT 12`,
    ),
  ]);

  const byState = Object.fromEntries(GUILD_STATES.map((s) => [s, 0])) as Record<string, number>;
  const byTier: Record<string, number> = { free: 0, medium: 0, pro: 0 };
  let mrrCents = 0;
  for (const row of states.rows) {
    byState[row.state] = (byState[row.state] ?? 0) + row.count;
    if (['paying', 'canceling', 'past_due', 'trial', 'comped'].includes(row.state) && row.tier in byTier) {
      byTier[row.tier] += row.count;
    }
    if (row.state === 'paying' || row.state === 'past_due') {
      mrrCents += row.count * (row.tier === 'pro' ? PRICE.pro : row.tier === 'medium' ? PRICE.medium : 0);
    }
  }
  const t = totals.rows[0];
  const paying = byState.paying + byState.canceling + byState.past_due;

  return {
    days,
    guilds: { total: t.guilds, byState, byTier, paying },
    users: { total: t.users },
    mrr_cents: mrrCents,
    arpu_cents: paying ? Math.round(mrrCents / Math.max(1, byState.paying + byState.past_due)) : 0,
    period: {
      new_users: t.new_users,
      new_users_prev: t.new_users_prev,
      new_guilds: t.new_guilds,
      new_guilds_prev: t.new_guilds_prev,
      revenue_cents: t.revenue_cents,
      revenue_prev_cents: t.revenue_prev_cents,
      new_subscriptions: t.new_subscriptions,
      churned: t.churned,
    },
    revenue_total_cents: t.revenue_total_cents,
    activity: { dau: t.dau, wau: t.wau, mau: t.mau, active_guilds_7d: t.active_guilds_7d },
    trial_conversion: ratio(t.trials_converted, t.trials_used),
    tracking_since: t.tracking_since,
    series: series.rows,
    recent: recent.rows,
  };
}

export interface FunnelQuery {
  days: number | null;
  region?: string;
}

export async function getFunnel({ days, region }: FunnelQuery) {
  const params: unknown[] = [];
  const guildWhere: string[] = [];
  if (days) guildWhere.push(`created_at::date >= ${periodStart(days)}`);
  if (region) {
    params.push(region);
    guildWhere.push(`region = $${params.length}`);
  }
  const guildWhereSql = guildWhere.length ? `WHERE ${guildWhere.join(' AND ')}` : '';
  const userSince = days ? `u.created_at::date >= ${periodStart(days)}` : 'TRUE';
  const eventSince = days ? `occurred_at::date >= ${periodStart(days)}` : 'TRUE';

  const [stages, users, logins] = await Promise.all([
    pool.query(
      `${GUILD_FACTS_SQL}
       SELECT stage, COUNT(*)::int AS count FROM facts ${guildWhereSql} GROUP BY stage`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS accounts,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM guild_members gm WHERE gm.user_id = u.id)
           OR EXISTS (SELECT 1 FROM analytics_events ae WHERE ae.user_id = u.id AND ae.name = 'guild_discovery'
                      AND (ae.props->>'count')::int > 0))::int AS guild_found,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM guild_members gm WHERE gm.user_id = u.id))::int AS guild_joined,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM characters c WHERE c.user_id = u.id AND c.guild_id IS NOT NULL))::int AS characters_imported,
         COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM user_activity_days a WHERE a.user_id = u.id) >= 2)::int AS returned
       FROM users u WHERE ${userSince}`,
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE name = 'login_started')::int AS started,
         COUNT(*) FILTER (WHERE name = 'login_succeeded')::int AS succeeded,
         COUNT(*) FILTER (WHERE name = 'login_succeeded' AND props->>'first' = 'true')::int AS signups,
         COUNT(*) FILTER (WHERE name = 'login_failed')::int AS failed
       FROM analytics_events
       WHERE name IN ('login_started', 'login_succeeded', 'login_failed') AND ${eventSince}`,
    ),
  ]);

  // Une guilde arrivée à l'étape n a franchi toutes les précédentes
  const stoppedAt = FUNNEL_STAGES.map((_, i) => stages.rows.find((r) => r.stage === i)?.count ?? 0);
  const total = stoppedAt.reduce((a, b) => a + b, 0);
  let remaining = total;
  const guildFunnel = FUNNEL_STAGES.map((key, i) => {
    const reached = remaining;
    remaining -= stoppedAt[i];
    return { key, reached, stopped: stoppedAt[i] };
  });

  const u = users.rows[0];
  return {
    days,
    region: region ?? null,
    guilds: guildFunnel,
    users: [
      { key: 'account_created', reached: u.accounts },
      { key: 'guild_found', reached: u.guild_found },
      { key: 'guild_joined', reached: u.guild_joined },
      { key: 'characters_imported', reached: u.characters_imported },
      { key: 'returned', reached: u.returned },
    ],
    logins: logins.rows[0],
  };
}

export async function getUsage() {
  const [series, adoption, cohorts, topGuilds] = await Promise.all([
    pool.query(
      `WITH d AS (SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day')::date AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
         COUNT(a.user_id)::int AS active_users,
         COUNT(DISTINCT a.guild_id)::int AS active_guilds
       FROM d LEFT JOIN user_activity_days a ON a.day = d.day
       GROUP BY d.day ORDER BY d.day`,
    ),
    pool.query(
      `WITH live AS (SELECT id, discord_enabled, fees_enabled FROM guilds WHERE subscription_expires_at > CURRENT_TIMESTAMP),
       since AS (SELECT CURRENT_TIMESTAMP - INTERVAL '30 days' AS t)
       SELECT
         (SELECT COUNT(*) FROM live)::int AS guilds,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM events e, since WHERE e.guild_id = l.id AND e.created_at > since.t))::int AS events,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM rosters r WHERE r.guild_id = l.id))::int AS rosters,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM events e, since WHERE e.guild_id = l.id AND COALESCE(e.logs, '') <> '' AND e.created_at > since.t))::int AS wcl_logs,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM fee_declarations f, since WHERE f.guild_id = l.id AND f.created_at > since.t))::int AS fees,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM craft_requests c, since WHERE c.guild_id = l.id AND c.created_at > since.t))::int AS crafts,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM help_posts h, since WHERE h.guild_id = l.id AND h.created_at > since.t))::int AS guild_help,
         (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM absences a, since WHERE a.guild_id = l.id AND a.created_at > since.t))::int AS absences,
         (SELECT COUNT(*) FROM live WHERE discord_enabled)::int AS discord`,
    ),
    pool.query(
      `WITH cohort AS (
         SELECT id, created_at::date AS signup, to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week
         FROM users WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 weeks'
       )
       SELECT c.week, NULL::int AS offset_week, COUNT(*)::int AS users FROM cohort c GROUP BY c.week
       UNION ALL
       SELECT c.week, ((a.day - c.signup) / 7)::int, COUNT(DISTINCT a.user_id)::int
       FROM cohort c JOIN user_activity_days a ON a.user_id = c.id AND a.day >= c.signup
       GROUP BY 1, 2`,
    ),
    pool.query(
      `SELECT g.id, g.name, g.realm, g.region, COUNT(DISTINCT a.user_id)::int AS active_users,
              COUNT(*)::int AS active_days
       FROM user_activity_days a JOIN guilds g ON g.id = a.guild_id
       WHERE a.day > CURRENT_DATE - 7
       GROUP BY g.id ORDER BY active_users DESC, active_days DESC LIMIT 8`,
    ),
  ]);

  // Matrice de rétention : semaine d'inscription × semaines écoulées (seulement celles déjà vécues)
  const weeks = new Map<string, { week: string; users: number; retention: (number | null)[] }>();
  for (const row of cohorts.rows.filter((r) => r.offset_week === null)) {
    weeks.set(row.week, { week: row.week, users: row.users, retention: [] });
  }
  const today = Date.now();
  for (const cohort of weeks.values()) {
    const elapsed = Math.floor((today - Date.parse(`${cohort.week}T00:00:00`)) / (7 * 86_400_000));
    cohort.retention = Array.from({ length: 8 }, (_, i) => (i <= elapsed ? 0 : null));
  }
  for (const row of cohorts.rows.filter((r) => r.offset_week !== null && r.offset_week < 8)) {
    const cohort = weeks.get(row.week);
    if (cohort && cohort.retention[row.offset_week] !== null) {
      cohort.retention[row.offset_week] = cohort.users ? row.users / cohort.users : 0;
    }
  }

  const a = adoption.rows[0];
  const features = ['events', 'rosters', 'wcl_logs', 'fees', 'crafts', 'guild_help', 'absences', 'discord'];
  return {
    series: series.rows,
    adoption: {
      guilds: a.guilds,
      features: features.map((key) => ({ key, guilds: a[key], share: ratio(a[key], a.guilds) })),
    },
    cohorts: [...weeks.values()].sort((x, y) => y.week.localeCompare(x.week)),
    top_guilds: topGuilds.rows,
  };
}

export async function getReasons(days: number) {
  const since = `occurred_at::date >= ${periodStart(days)}`;
  const [feedback, comments, signals, declines, blockedMembers] = await Promise.all([
    pool.query(
      `SELECT source, reason, COUNT(*)::int AS count
       FROM churn_feedback WHERE created_at::date >= ${periodStart(days)}
       GROUP BY source, reason ORDER BY count DESC`,
    ),
    pool.query(
      `SELECT cf.id, cf.source, cf.reason, cf.comment, cf.created_at, g.id AS guild_id, g.name AS guild_name,
              u.battletag
       FROM churn_feedback cf
       LEFT JOIN guilds g ON g.id = cf.guild_id
       LEFT JOIN users u ON u.id = cf.user_id
       WHERE cf.created_at::date >= ${periodStart(days)} AND cf.comment <> ''
       ORDER BY cf.created_at DESC LIMIT 40`,
    ),
    pool.query(
      `SELECT name, COALESCE(props->>'reason', props->>'code', '') AS detail, COUNT(*)::int AS count
       FROM analytics_events
       WHERE ${since} AND name IN ('login_failed', 'guild_select_failed', 'checkout_started', 'checkout_canceled',
                                   'checkout_expired', 'checkout_completed', 'subscription_ended', 'subscription_past_due')
       GROUP BY 1, 2
       UNION ALL
       SELECT 'no_guild_found', '', COUNT(DISTINCT user_id)::int
       FROM analytics_events
       WHERE ${since} AND name = 'guild_discovery' AND (props->>'count')::int = 0
         AND NOT EXISTS (SELECT 1 FROM guild_members gm WHERE gm.user_id = analytics_events.user_id)`,
    ),
    pool.query(
      `SELECT COALESCE(props->>'decline_code', 'unknown') AS code, COUNT(*)::int AS count
       FROM analytics_events WHERE name = 'payment_failed' AND ${since}
       GROUP BY 1 ORDER BY count DESC`,
    ),
    // Guildes où seuls des membres sans droit de paiement ont vu la page d'offres
    pool.query(
      `${GUILD_FACTS_SQL}
       SELECT COUNT(*)::int AS count FROM facts
       WHERE stage < 3 AND EXISTS (
         SELECT 1 FROM analytics_events ae
         WHERE ae.guild_id = facts.id AND ae.name = 'payment_viewed' AND ae.props->>'can_manage' = 'false'
           AND ae.${since})`,
    ),
  ]);

  const signal = (name: string) => signals.rows.filter((r) => r.name === name);
  const sum = (name: string) => signal(name).reduce((a, r) => a + r.count, 0);
  const checkoutStarted = sum('checkout_started');

  return {
    days,
    feedback: feedback.rows,
    comments: comments.rows,
    login_failures: signal('login_failed').map(({ detail, count }) => ({ reason: detail || 'unknown', count })),
    guild_select_failures: signal('guild_select_failed').map(({ detail, count }) => ({ code: detail || 'unknown', count })),
    no_guild_found: sum('no_guild_found'),
    blocked_not_manager: blockedMembers.rows[0].count,
    checkout: {
      started: checkoutStarted,
      completed: sum('checkout_completed'),
      canceled: sum('checkout_canceled'),
      expired: sum('checkout_expired'),
      abandon_rate: ratio(sum('checkout_canceled') + sum('checkout_expired'), checkoutStarted),
    },
    payment_failures: declines.rows,
    past_due: sum('subscription_past_due'),
    ended: sum('subscription_ended'),
  };
}

export async function getHealth() {
  const [db, tracking] = await Promise.all([
    pool.query(
      `SELECT pg_database_size(current_database())::bigint AS size_bytes,
              (SELECT COUNT(*) FROM session WHERE expire > NOW())::int AS sessions,
              (SELECT COUNT(*) FROM analytics_events)::int AS analytics_events`,
    ),
    pool.query(`SELECT MIN(occurred_at) AS since FROM analytics_events`),
  ]);
  const secret = process.env.STRIPE_SECRET_KEY ?? '';
  return {
    integrations: [
      { key: 'stripe', ok: !!stripe, detail: stripe ? (secret.startsWith('sk_live') ? 'live' : 'test') : 'mock' },
      { key: 'stripe_webhook', ok: !!process.env.STRIPE_WEBHOOK_SECRET, detail: null },
      { key: 'discord_bot', ok: discordClient.isReady(), detail: discordClient.user?.tag ?? null },
      { key: 'battlenet', ok: !!(process.env.BNET_CLIENT_ID && process.env.BNET_CLIENT_SECRET), detail: null },
      { key: 'warcraft_logs', ok: !!(process.env.WCL_CLIENT_ID && process.env.WCL_CLIENT_SECRET), detail: null },
      { key: 'smtp', ok: !!(process.env.SMTP_HOST && process.env.SMTP_USER), detail: null },
    ],
    cron: cronRuns(),
    database: {
      size_bytes: Number(db.rows[0].size_bytes),
      sessions: db.rows[0].sessions,
      analytics_events: db.rows[0].analytics_events,
      tracking_since: tracking.rows[0].since,
    },
    process: {
      uptime_s: Math.round(process.uptime()),
      rss_bytes: process.memoryUsage().rss,
      node: process.version,
    },
  };
}

/** Résumé des dernières 24 h (digest Discord quotidien). */
export async function getDailyDigest() {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 day')::int AS new_users,
       (SELECT COUNT(*) FROM guilds WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 day')::int AS new_guilds,
       (SELECT COUNT(*) FROM analytics_events WHERE name = 'free_trial_activated' AND occurred_at > NOW() - INTERVAL '1 day')::int AS trials,
       (SELECT COUNT(*) FROM analytics_events WHERE name = 'checkout_completed' AND occurred_at > NOW() - INTERVAL '1 day')::int AS subscriptions,
       (SELECT COUNT(*) FROM analytics_events WHERE name IN ('checkout_canceled', 'checkout_expired') AND occurred_at > NOW() - INTERVAL '1 day')::int AS abandoned,
       (SELECT COUNT(*) FROM analytics_events WHERE name = 'payment_failed' AND occurred_at > NOW() - INTERVAL '1 day')::int AS payment_failures,
       (SELECT COUNT(*) FROM analytics_events WHERE name IN ('subscription_cancel_requested', 'subscription_ended') AND occurred_at > NOW() - INTERVAL '1 day')::int AS cancellations,
       (SELECT COUNT(*) FROM churn_feedback WHERE created_at > NOW() - INTERVAL '1 day')::int AS feedback,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE paid_at > NOW() - INTERVAL '1 day')::int AS revenue_cents,
       (SELECT COUNT(*) FROM user_activity_days WHERE day = CURRENT_DATE - 1)::int AS active_users`,
  );
  const overview = await getOverview(30);
  return { ...rows[0], mrr_cents: overview.mrr_cents, paying: overview.guilds.paying };
}
