import { Request, Response, NextFunction } from 'express';
import pool from '../lib/db';

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
    const guildRes = await pool.query('SELECT subscription_expires_at FROM guilds WHERE id = $1', [req.user.active_guild_id]);
    const guild = guildRes.rows[0];
    if (!guild || !guild.subscription_expires_at || new Date(guild.subscription_expires_at) < new Date()) {
      return res.status(402).json({ status: 'error', code: 'GUILD_UNPAID', message: 'Payment required for this guild' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const hasRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const userRole = (req.user.role as UserRole) || 'member';
    
    // Admin has access to everything
    if (userRole === 'admin' || roles.includes(userRole)) {
      return next();
    }

    res.status(403).json({ status: 'error', message: `Forbidden: One of these roles required: ${roles.join(', ')}` });
  };
};

export const isAdmin = hasRole(['admin']);
export const canManageRosters = hasRole(['admin', 'raid_leader']);
export const canManageEvents = hasRole(['admin', 'raid_leader', 'event_manager']);
export const canManageFees = hasRole(['admin', 'treasurer']);
