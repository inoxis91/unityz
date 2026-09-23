import pool from '../lib/db';
import { sendDiscordDM } from '../lib/discord';
import { t, getDiscordLocale, SupportedDiscordLocale } from '../lib/i18n';
import type { LineupSelection, RaidRole } from './lineupService';

/** État visible par le joueur : sélection + rôle effectivement joué. */
export interface LineupSnapshot {
  selection: LineupSelection | null;
  role: RaidRole;
}

interface PendingNotification {
  baseline: LineupSnapshot;
  timer: NodeJS.Timeout;
}

interface NotificationContext {
  role: RaidRole;
  selection: LineupSelection | null;
  assigned_role: RaidRole | null;
  discord_id: string | null;
  character_name: string | null;
  title: string;
  start_time: string;
  is_canceled: boolean | null;
  is_past: boolean;
  discord_enabled: boolean | null;
  discord_locale: string | null;
}

/**
 * Fenêtre de regroupement : un raid lead fait souvent plusieurs ajustements d'affilée
 * (valider, banc, re-valider, changer le rôle...). On n'envoie qu'un MP avec l'état final,
 * et aucun si l'état final est identique à l'état initial.
 */
const DEBOUNCE_MS = 15_000;

const pending = new Map<string, PendingNotification>();

export class LineupNotifier {
  static schedule(eventId: string, userId: string, baseline: LineupSnapshot): void {
    const key = `${eventId}:${userId}`;
    const existing = pending.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      pending.delete(key);
      this.flush(eventId, userId, existing?.baseline ?? baseline).catch((err) =>
        console.error(`[Lineup] Failed to notify user ${userId} for event ${eventId}:`, err),
      );
    }, DEBOUNCE_MS);
    timer.unref();

    pending.set(key, { baseline: existing?.baseline ?? baseline, timer });
  }

  private static async flush(eventId: string, userId: string, baseline: LineupSnapshot): Promise<void> {
    const { rows } = await pool.query<NotificationContext>(
      `SELECT s.role, s.selection, s.assigned_role, u.discord_id, c.name AS character_name,
              e.title, to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_time, e.is_canceled,
              e.start_time < (NOW() AT TIME ZONE 'Europe/Paris') AS is_past,
              g.discord_enabled, g.discord_locale
       FROM event_signups s
       JOIN users u ON u.id = s.user_id
       JOIN events e ON e.id = s.event_id
       JOIN guilds g ON g.id = e.guild_id
       LEFT JOIN characters c ON c.id = s.character_id
       WHERE s.event_id = $1 AND s.user_id = $2`,
      [eventId, userId],
    );
    const ctx = rows[0];
    // Désinscrit entre-temps, Discord non lié / désactivé, ou événement plus d'actualité
    if (!ctx?.discord_id || !ctx.discord_enabled || ctx.is_canceled || ctx.is_past) return;

    const current: LineupSnapshot = { selection: ctx.selection, role: ctx.assigned_role ?? ctx.role };
    const message = buildMessage(eventId, baseline, current, ctx, getDiscordLocale(ctx));
    if (message) await sendDiscordDM(ctx.discord_id, message);
  }
}

function buildMessage(
  eventId: string,
  before: LineupSnapshot,
  after: LineupSnapshot,
  ctx: NotificationContext,
  locale: SupportedDiscordLocale,
): string | null {
  const selectionChanged = before.selection !== after.selection;
  const roleChanged = before.role !== after.role;
  if (!selectionChanged && !roleChanged) return null;

  const start = new Date(ctx.start_time);
  const params = {
    eventTitle: ctx.title,
    date: start.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: start.toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
    role: t(locale, `discord.lineup.role.${after.role}`),
    character: ctx.character_name ?? '',
  };

  const headlineKey = selectionChanged
    ? `discord.lineup.${after.selection ?? 'pending'}`
    : 'discord.lineup.role_changed';

  const lines = [t(locale, headlineKey), t(locale, 'discord.lineup.event_line', params)];
  if (after.selection !== 'benched' || roleChanged) {
    lines.push(t(locale, ctx.character_name ? 'discord.lineup.character_role_line' : 'discord.lineup.role_line', params));
  }
  if (after.selection === 'benched') lines.push(t(locale, 'discord.lineup.benched_outro'));

  let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  if (frontendUrl.endsWith('/')) frontendUrl = frontendUrl.slice(0, -1);
  lines.push(t(locale, 'discord.lineup.link', { link: `<${frontendUrl}/events/${eventId}>` }));

  return lines.join('\n');
}
