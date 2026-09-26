import { NextFunction, Request, Response } from 'express';
import pool from '../lib/db';

/**
 * Administrateurs de la plateforme (créateur du site), distincts des admins de guilde. Identifiés
 * par leur `bnet_id` Battle.net, immuable (un BattleTag peut être renommé) et jamais fourni par le
 * client : il vient du profil OAuth. Liste séparée par des virgules.
 */
const PLATFORM_ADMIN_BNET_IDS = new Set(
  (process.env.PLATFORM_ADMIN_BNET_IDS ?? '')
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter(Number.isSafeInteger),
);

if (PLATFORM_ADMIN_BNET_IDS.size === 0) {
  console.warn('[Platform] PLATFORM_ADMIN_BNET_IDS not set. Back-office disabled.');
}

/** Une session plus ancienne doit repasser par Battle.net avant d'ouvrir le back-office. */
export const PLATFORM_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const isPlatformAdmin = (user: Express.User | undefined): boolean =>
  !!user && PLATFORM_ADMIN_BNET_IDS.has(Number(user.bnet_id));

export const platformAdminBnetIds = (): number[] => [...PLATFORM_ADMIN_BNET_IDS];

const allowedOrigin = (() => {
  try {
    return new URL(process.env.FRONTEND_URL || 'http://localhost:4200').origin;
  } catch {
    return null;
  }
})();

// Réponse identique à une route inexistante : le back-office ne révèle pas son existence
const notFound = (res: Response) => res.status(404).json({ status: 'error', message: 'Not found' });

/**
 * Garde du back-office :
 * - admin plateforme uniquement, 404 pour tout le monde (connecté ou non) ;
 * - requêtes du site lui-même uniquement (le CORS global accepte toutes les origines) ;
 * - connexion Battle.net de moins de 12 h, sinon 401 PLATFORM_REAUTH_REQUIRED.
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !isPlatformAdmin(req.user)) return notFound(res);

  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== allowedOrigin)) {
    console.warn(`[Platform] Rejected cross-origin request from ${origin ?? 'unknown origin'}`);
    return notFound(res);
  }

  const authenticatedAt = req.session.authenticated_at ?? 0;
  if (Date.now() - authenticatedAt > PLATFORM_SESSION_MAX_AGE_MS) {
    return res.status(401).json({
      status: 'error',
      code: 'PLATFORM_REAUTH_REQUIRED',
      message: 'Please log in again with Battle.net to open the back-office.',
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Journal d'audit du back-office (actions et consultations de fiches). */
export async function audit(
  req: Request,
  action: string,
  { guildId = null, details = {} }: { guildId?: string | null; details?: Record<string, unknown> } = {},
) {
  await pool.query(
    `INSERT INTO platform_audit_log (actor_user_id, actor_battletag, action, guild_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user!.id, req.user!.battletag, action, guildId, details, req.ip ?? null],
  );
}
