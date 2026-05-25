import { Request, Response, NextFunction } from 'express';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ status: 'error', message: 'Not authenticated' });
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user.is_admin === true) {
    return next();
  }
  res.status(403).json({ status: 'error', message: 'Forbidden: Admin access required' });
};
