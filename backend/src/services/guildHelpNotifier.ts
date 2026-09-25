import { escapeMarkdown } from 'discord.js';
import pool from '../lib/db';
import { sendDiscordChannelMessage, sendDiscordDM } from '../lib/discord';
import { getDiscordLocale, SupportedDiscordLocale, t } from '../lib/i18n';

interface PostContext {
  kind: 'request' | 'offer';
  category: string;
  target_role: string | null;
  title: string;
  capacity: number;
  author_name: string;
  author_discord_id: string | null;
  discord_enabled: boolean | null;
  discord_help_channel_id: string | null;
  discord_locale: string | null;
}

interface ApplicationContext extends PostContext {
  applicant_name: string;
  applicant_discord_id: string | null;
  message: string;
}

/** Nom affiché : main dans la guilde, sinon BattleTag. */
const displayName = (userCol: string, guildCol: string) => `
  COALESCE(
    (SELECT c.name FROM characters c WHERE c.user_id = ${userCol} AND c.guild_id = ${guildCol}
     ORDER BY c.is_main DESC, c.updated_at DESC LIMIT 1),
    (SELECT battletag FROM users WHERE id = ${userCol})
  )`;

const POST_CONTEXT_COLUMNS = `
  p.kind, p.category, p.target_role, p.title, p.capacity,
  ${displayName('p.author_user_id', 'p.guild_id')} AS author_name,
  NULLIF(au.discord_id, '') AS author_discord_id,
  g.discord_enabled, g.discord_help_channel_id, g.discord_locale`;

/**
 * Notifications Discord de l'entraide. Toujours appelées après le COMMIT, sans attente :
 * un échec Discord est journalisé et n'affecte jamais l'action du membre.
 */
export class GuildHelpNotifier {
  static postCreated(postId: string): void {
    run('post created', async () => {
      const { rows } = await pool.query<PostContext>(
        `SELECT ${POST_CONTEXT_COLUMNS}
         FROM help_posts p
         JOIN users au ON au.id = p.author_user_id
         JOIN guilds g ON g.id = p.guild_id
         WHERE p.id = $1`,
        [postId],
      );
      const ctx = rows[0];
      if (!ctx?.discord_enabled || !ctx.discord_help_channel_id) return;

      const locale = getDiscordLocale(ctx);
      const lines = [
        t(locale, `discord.help.new_${ctx.kind}_title`),
        t(locale, 'discord.help.author_line', {
          author: safe(ctx.author_name),
          category: t(locale, `discord.help.category.${ctx.category}`),
        }),
        t(locale, 'discord.help.title_line', { title: safe(ctx.title) }),
      ];
      if (ctx.target_role) {
        lines.push(t(locale, 'discord.help.role_line', { role: t(locale, `discord.lineup.role.${ctx.target_role}`) }));
      }
      if (ctx.kind === 'offer') {
        lines.push(t(locale, 'discord.help.capacity_line', { capacity: String(ctx.capacity) }));
      }
      lines.push('', t(locale, `discord.help.cta_${ctx.kind}`, { link: link('') }));

      await sendDiscordChannelMessage(ctx.discord_help_channel_id, lines.join('\n'));
    });
  }

  /** MP à l'auteur quand un membre répond à son annonce. */
  static applicationReceived(applicationId: string): void {
    run('application received', async () => {
      const ctx = await loadApplication(applicationId);
      if (!ctx?.discord_enabled || !ctx.author_discord_id) return;

      const locale = getDiscordLocale(ctx);
      const lines = [
        t(locale, `discord.help.applied_${ctx.kind}`, {
          applicant: safe(ctx.applicant_name),
          title: safe(ctx.title),
        }),
      ];
      if (ctx.message) lines.push(t(locale, 'discord.help.message_line', { message: safe(ctx.message) }));
      lines.push(t(locale, 'discord.help.review_link', { link: link('?tab=mine') }));

      await sendDiscordDM(ctx.author_discord_id, lines.join('\n'));
    });
  }

  /** MP au membre dont la candidature a été acceptée : le binôme est formé. */
  static applicationAccepted(applicationId: string): void {
    run('application accepted', async () => {
      const ctx = await loadApplication(applicationId);
      if (!ctx?.discord_enabled || !ctx.applicant_discord_id) return;

      const locale: SupportedDiscordLocale = getDiscordLocale(ctx);
      const lines = [
        t(locale, `discord.help.accepted_${ctx.kind}`, { author: safe(ctx.author_name), title: safe(ctx.title) }),
        t(locale, 'discord.help.pair_link', { link: link('?tab=pairs') }),
      ];
      await sendDiscordDM(ctx.applicant_discord_id, lines.join('\n'));
    });
  }
}

async function loadApplication(applicationId: string): Promise<ApplicationContext | undefined> {
  const { rows } = await pool.query<ApplicationContext>(
    `SELECT ${POST_CONTEXT_COLUMNS},
            ${displayName('a.user_id', 'a.guild_id')} AS applicant_name,
            NULLIF(apu.discord_id, '') AS applicant_discord_id,
            a.message
     FROM help_applications a
     JOIN help_posts p ON p.id = a.post_id
     JOIN users au ON au.id = p.author_user_id
     JOIN users apu ON apu.id = a.user_id
     JOIN guilds g ON g.id = p.guild_id
     WHERE a.id = $1`,
    [applicationId],
  );
  return rows[0];
}

function run(label: string, task: () => Promise<void>): void {
  task().catch((err) => console.error(`[GuildHelp] Discord notification failed (${label}):`, err));
}

/** Texte saisi par un membre : pas de mise en forme ni de mention (@everyone) possible. */
function safe(text: string): string {
  return escapeMarkdown(text).replace(/@/g, '@​');
}

function link(suffix: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/+$/, '');
  return `<${base}/guild-help${suffix}>`;
}
