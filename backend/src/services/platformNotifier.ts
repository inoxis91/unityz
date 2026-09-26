import pool from '../lib/db';
import { sendDiscordDM } from '../lib/discord';
import { getDiscordLocale, t } from '../lib/i18n';
import { platformAdminBnetIds } from '../middlewares/platform';
import { track } from './analytics';
import { getDailyDigest } from './platformStatsService';

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/+$/, '');

const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

/** Digest quotidien en DM aux admins plateforme qui ont lié leur Discord. */
export async function sendPlatformDigest() {
  const ids = platformAdminBnetIds();
  if (!ids.length) return;
  const { rows: admins } = await pool.query(
    'SELECT discord_id FROM users WHERE bnet_id = ANY($1::int[]) AND discord_id IS NOT NULL',
    [ids],
  );
  if (!admins.length) return;

  const d = await getDailyDigest();
  const message = `${t('fr', 'discord.digest.title')}\n${t('fr', 'discord.digest.body', {
    newUsers: String(d.new_users),
    newGuilds: String(d.new_guilds),
    trials: String(d.trials),
    subscriptions: String(d.subscriptions),
    abandoned: String(d.abandoned),
    paymentFailures: String(d.payment_failures),
    cancellations: String(d.cancellations),
    feedback: String(d.feedback),
    revenue: euros(d.revenue_cents),
    mrr: euros(d.mrr_cents),
    paying: String(d.paying),
    activeUsers: String(d.active_users),
    url: `${frontendUrl()}/backoffice`,
  })}`;
  await Promise.all(admins.map((a) => sendDiscordDM(a.discord_id, message)));
  console.log(`[Platform] Daily digest sent to ${admins.length} admin(s).`);
}

/**
 * Essais gratuits terminés depuis moins de 48 h sans abonnement : un DM aux GM / officiers avec le
 * lien des offres et celui du questionnaire. Une seule fois par guilde (événement trial_end_notified).
 */
export async function notifyEndedTrials() {
  const { rows: guilds } = await pool.query(
    `SELECT g.id, g.name, g.discord_locale
     FROM guilds g
     WHERE g.subscription_tier = 'free'
       AND g.subscription_expires_at BETWEEN CURRENT_TIMESTAMP - INTERVAL '48 hours' AND CURRENT_TIMESTAMP
       AND g.stripe_subscription_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM analytics_events ae WHERE ae.guild_id = g.id AND ae.name = 'trial_end_notified')`,
  );

  for (const guild of guilds) {
    const { rows: managers } = await pool.query(
      `SELECT u.discord_id FROM guild_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.guild_id = $1 AND u.discord_id IS NOT NULL AND (gm.role = 'admin' OR gm.rank <= 2)`,
      [guild.id],
    );
    const message = t(getDiscordLocale(guild), 'discord.trial_end.message', {
      guild: guild.name,
      url: `${frontendUrl()}/payment`,
      feedbackUrl: `${frontendUrl()}/payment?feedback=trial_end`,
    });
    const sent = (await Promise.all(managers.map((m) => sendDiscordDM(m.discord_id, message)))).filter(Boolean).length;
    // Enregistré même sans destinataire : on ne réessaie pas chaque jour une guilde sans Discord lié
    track('trial_end_notified', { guildId: guild.id, props: { recipients: sent } });
  }
  if (guilds.length) console.log(`[Platform] Trial end notified for ${guilds.length} guild(s).`);
}
