import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from './config/passport';
import cors from 'cors';
import dotenv from 'dotenv';

import { initDb } from './lib/db';
import characterRoutes from './routes/characters';
import eventRoutes from './routes/events';
import rosterRoutes from './routes/rosters';
import feeRoutes from './routes/fees';
import userRoutes from './routes/users';
import { errorHandler } from './middlewares/errorHandler';
import { initDiscord } from './lib/discord';
import { initCronJobs } from './lib/cron';
import { UserService } from './services/userService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Clean up FRONTEND_URL if it has a trailing slash
let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
if (frontendUrl.endsWith('/')) {
  frontendUrl = frontendUrl.slice(0, -1);
}

if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.set('trust proxy', 1); // Trust the first proxy (Railway/Heroku)
}

// Initialize Database
initDb();

// Initialize Discord & Cron
initDiscord();
initCronJobs();

app.use(cors({
  origin: [
    frontendUrl,
    'https://unityz.up.railway.app',
    'https://unityz-production.up.railway.app'
  ],
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

app.use(session({
  secret: process.env.SESSION_SECRET || 'unityz-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/characters', characterRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/rosters', rosterRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/users', userRoutes);

// Auth Routes
app.get('/api/auth/bnet', (req, res, next) => {
  const redirect = req.query.redirect as string;
  if (redirect && redirect.startsWith('/')) {
    res.cookie('redirect_after_login', redirect, { 
      maxAge: 10 * 60 * 1000, 
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax'
    });
  }
  passport.authenticate('bnet')(req, res, next);
});

app.get('/api/auth/bnet/callback', (req, res, next) => {
  passport.authenticate('bnet', { failureRedirect: `${frontendUrl}/login` })(req, res, () => {
    // Une fois authentifié par passport, on gère la redirection et le nettoyage des cookies
    let target = frontendUrl + '/';
    const redirect = req.cookies?.redirect_after_login;
    
    if (redirect && redirect.startsWith('/')) {
      target = frontendUrl + redirect;
      res.clearCookie('redirect_after_login', {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax'
      });
    }

    // On force la sauvegarde de la session avant de rediriger pour éviter les problèmes sur certains navigateurs (Firefox)
    req.session.save((err) => {
      if (err) {
        console.error('[Auth] Session save error:', err);
        return next(err);
      }
      res.redirect(target);
    });
  });
});

// Discord Auth Routes (for account linking)
app.get('/api/auth/discord', passport.authorize('discord'));

app.get('/api/auth/discord/callback', (req, res, next) => {
  passport.authorize('discord', { failureRedirect: `${frontendUrl}/options?error=discord_failed` })(req, res, (err: any) => {
    if (err) return next(err);
    
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('[Auth] Discord session save error:', saveErr);
      }
      res.redirect(`${frontendUrl}/options?tab=settings&success=discord_linked`);
    });
  });
});

app.get('/api/auth/logout', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  req.logout((err) => {
    if (err) { return next(err); }
    
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const)
    };

    if (req.session) {
      req.session.destroy((err) => {
        if (err) { console.error('[Auth] Logout session destroy error:', err); }
        res.clearCookie('connect.sid', cookieOptions);
        return res.status(200).json({ status: 'success' });
      });
    } else {
      res.clearCookie('connect.sid', cookieOptions);
      res.status(200).json({ status: 'success' });
    }
  });
});

app.get('/api/users/me', async (req, res, next) => {
  // Empêcher la mise en cache de l'identité (très important pour le logout/refresh)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.isAuthenticated()) {
    try {
      const user = req.user as any;
      const has_characters = await UserService.hasCharacters(user.id);
      res.json({
        ...user,
        has_characters
      });
    } catch (error) {
      next(error);
    }
  } else {
    res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
