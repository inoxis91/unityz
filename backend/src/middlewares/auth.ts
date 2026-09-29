import { Request, Response, NextFunction } from 'express';
import pool from '../lib/db';
import { hasPaidAccessSql } from '../lib/guildAccess';

export type UserRole = 'admin' | 'raid_leader' | 'treasurer' | 'event_manager' | 'member';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ status: 'error', message: 'Not authenticated' });
};

export const requireActiveGuild = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }
  if (!req.user.active_guild_id) {
    return res.status(403).json({ status: 'error', code: 'NO_ACTIVE_GUILD', message: 'Active guild selection required' });
  }
  next();
};

export const requirePaidGuild = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }
  if (!req.user.active_guild_id) {
    return res.status(403).json({ status: 'error', code: 'NO_ACTIVE_GUILD', message: 'Active guild selection required' });
  }

  try {
    const guildRes = await pool.query(`SELECT 1 FROM guilds g WHERE g.id = $1 AND ${hasPaidAccessSql('g')}`, [
      req.user.active_guild_id,
    ]);
    if (!guildRes.rows[0]) {
      return res.status(402).json({ status: 'error', code: 'GUILD_UNPAID', message: 'Payment required for this guild' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Rôle de l'utilisateur dans la guilde active ; admin passe tous les contrôles. */
export const userHasRole = (user: Express.User, roles: readonly UserRole[]): boolean => {
  const userRole = (user.role as UserRole) || 'member';
  return userRole === 'admin' || roles.includes(userRole);
};

export const hasRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    if (userHasRole(req.user, roles)) {
      return next();
    }

    res.status(403).json({ status: 'error', message: `Forbidden: One of these roles required: ${roles.join(', ')}` });
  };
};

export const isAdmin = hasRole(['admin']);
export const canManageRosters = hasRole(['admin', 'raid_leader']);
export const canManageEvents = hasRole(['admin', 'raid_leader', 'event_manager']);
// Line-up raid (validé / banc, rôle imposé, joueurs externes) : réservé au raid lead
export const LINEUP_MANAGER_ROLES: UserRole[] = ['admin', 'raid_leader'];
export const canManageLineup = hasRole(LINEUP_MANAGER_ROLES);
export const canManageFees = hasRole(['admin', 'treasurer']);

/** Admin de l'app, GM ou officier en jeu (rang ≤ 2) : modère l'entraide de la guilde. */
export const isGuildModerator = (user: Express.User): boolean =>
  user.role === 'admin' || (user.rank !== null && user.rank !== undefined && user.rank <= 2);
