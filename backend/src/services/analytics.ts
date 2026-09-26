import { NextFunction, Request, Response } from 'express';
import pool from '../lib/db';

/**
 * Événements du parcours d'une guilde, écrits côté serveur aux points clés (le client ne peut en
 * émettre que quelques-uns, voir CLIENT_EVENTS). Lus uniquement par le back-office.
 */
export type AnalyticsEvent =
  | 'login_started'
  | 'login_succeeded'
  | 'login_failed'
  | 'guild_discovery'
  | 'guild_selected'
  | 'guild_select_failed'
  | 'characters_imported'
  | 'payment_viewed'
  | 'checkout_started'
  | 'checkout_canceled'
  | 'checkout_expired'
  | 'checkout_completed'
  | 'free_trial_activated'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'plan_changed'
  | 'subscription_past_due'
  | 'subscription_cancel_requested'
  | 'subscription_ended'
  | 'trial_end_notified'
  | 'feedback_submitted'
  | 'platform_action';

/** Événements que le navigateur peut signaler lui-même (le reste est déduit par le serveur). */
export const CLIENT_EVENTS = ['payment_viewed', 'checkout_canceled'] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

interface TrackContext {
  userId?: string | null;
  guildId?: string | null;
  props?: Record<string, unknown>;
}

/**
 * Enregistre un événement sans jamais bloquer ni faire échouer la requête métier : une panne de
 * l'analytique ne doit pas empêcher une connexion ou un paiement.
 */
export function track(name: AnalyticsEvent, { userId = null, guildId = null, props = {} }: TrackContext = {}) {
  pool
    .query('INSERT INTO analytics_events (name, user_id, guild_id, props) VALUES ($1, $2, $3, $4)', [
      name,
      userId,
      guildId,
      props,
    ])
    .catch((err) => console.warn(`[Analytics] Failed to record ${name}:`, err.message));
}

/**
 * Événement client dédoublonné : une page rechargée en boucle ne gonfle pas le tunnel
 * (un seul enregistrement par utilisateur, guilde et nom sur la fenêtre donnée).
 */
export async function trackOnce(
  name: AnalyticsEvent,
  { userId, guildId, props = {} }: TrackContext & { userId: string },
  windowMinutes: number,
) {
  await pool.query(
    `INSERT INTO analytics_events (name, user_id, guild_id, props)
     SELECT $1::varchar, $2::varchar, $3::uuid, $4::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM analytics_events
       WHERE name = $1::varchar AND user_id = $2::varchar AND guild_id IS NOT DISTINCT FROM $3::uuid
         AND occurred_at > NOW() - make_interval(mins => $5::int)
     )`,
    [name, userId, guildId ?? null, props, windowMinutes],
  );
}

// Jours d'activité déjà enregistrés par ce processus : une seule écriture par utilisateur et par jour
const seenToday = new Set<string>();
let seenDay = '';

/** Middleware : marque l'utilisateur connecté comme actif aujourd'hui. */
export function recordActivity(req: Request, _res: Response, next: NextFunction) {
  const user = req.user;
  if (user && req.path.startsWith('/api/')) {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== seenDay) {
      seenDay = day;
      seenToday.clear();
    }
    if (!seenToday.has(user.id)) {
      seenToday.add(user.id);
      pool
        .query(
          // Jour de la base (comme les requêtes du back-office) : une écriture en trop autour de minuit est sans effet
          `INSERT INTO user_activity_days (day, user_id, guild_id) VALUES (CURRENT_DATE, $1, $2)
           ON CONFLICT (day, user_id) DO UPDATE SET guild_id = COALESCE(user_activity_days.guild_id, EXCLUDED.guild_id)`,
          [user.id, user.active_guild_id ?? null],
        )
        .catch((err) => {
          seenToday.delete(user.id);
          console.warn('[Analytics] Failed to record activity:', err.message);
        });
    }
  }
  next();
}
