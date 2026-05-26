import { Request, Response, NextFunction } from 'express';

export type UserRole = 'admin' | 'raid_leader' | 'treasurer' | 'event_manager' | 'member';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ status: 'error', message: 'Not authenticated' });
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
