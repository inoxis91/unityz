import { Request, Response, NextFunction } from 'express';
import pool from '../lib/db';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  console.warn(`[Auth Middleware] Rejected unauthenticated request: ${req.method} ${req.originalUrl || req.path}. SessionID: ${req.sessionID}`);
  res.status(401).json({ status: 'error', message: 'Not authenticated' });
};

// Check if user is a GM or Officer (rank 0 or 1) in their current active guild
const isGuildAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }

  const user = req.user as any;
  if (!user.current_guild_id) {
    return res.status(403).json({ status: 'error', message: 'No active guild selected' });
  }

  try {
    const checkResult = await pool.query(`
      SELECT guild_rank 
      FROM characters 
      WHERE user_id = $1 AND guild_id = $2 
      ORDER BY guild_rank ASC NULLS LAST 
      LIMIT 1
    `, [user.id, user.current_guild_id]);

    if (checkResult.rowCount === 0 || checkResult.rows[0].guild_rank > 1 || checkResult.rows[0].guild_rank === null) {
      return res.status(403).json({ status: 'error', message: 'Forbidden. Admin/Officer rights required for this guild.' });
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Temporarily map all existing granular roles to the new GM/Officer rank system
// This can be refined later if granular roles are re-introduced per-guild.
export const isAdmin = isGuildAdmin;
export const canManageRosters = isGuildAdmin;
export const canManageEvents = isGuildAdmin;
export const canManageFees = isGuildAdmin;
