import express from 'express';
import session from 'express-session';
import passport from './config/passport';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import pool, { initDb } from './lib/db';
import characterRoutes from './routes/characters';
import eventRoutes from './routes/events';
import rosterRoutes from './routes/rosters';
import feeRoutes from './routes/fees';
import userRoutes from './routes/users';
import stripeRoutes from './routes/stripe';
import guildRoutes from './routes/guilds';
import mockAuthRoutes from './routes/mockAuth';
import supportRoutes from './routes/support';
import { errorHandler } from './middlewares/errorHandler';
import { initDiscord } from './lib/discord';
import { initCronJobs } from './lib/cron';
import { UserService } from './services/userService';

// Étendre le type Session pour inclure nos propriétés personnalisées
declare module 'express-session' {
  interface SessionData {
    redirect_after_login?: string;
  }
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Clean up FRONTEND_URL if it has a trailing slash
let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
if (frontendUrl.endsWith('/')) {
  frontendUrl = frontendUrl.slice(0, -1);
}

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_STATIC_URL;

console.log(`[System] Environment: ${isProd ? 'Production' : 'Development'}`);
if (isProd) {
  app.set('trust proxy', 1);
  console.log('[System] Trust Proxy enabled (1)');
}

// Initialize Database
initDb();

// Initialize Discord & Cron
initDiscord();
initCronJobs();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.endsWith('.up.railway.app') || origin.includes('localhost')) {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true,
}));

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(session({
  name: 'unityz_sid',
  secret: process.env.SESSION_SECRET || 'unityz-secret',
  resave: true, 
  saveUninitialized: false,
  rolling: true,
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
app.use('/api/stripe', stripeRoutes);
app.use('/api/guilds', guildRoutes);
app.use('/api/support', supportRoutes);

if (!isProd) {
  app.use('/api/mock-auth', mockAuthRoutes);
  console.log('[System] Mock Authentication routes enabled on /api/mock-auth');
}

// --- SERVING FRONTEND ---
if (isProd) {
  const publicPath = path.join(__dirname, '../public');
  console.log(`[System] Serving frontend from: ${publicPath}`);
  app.use(express.static(publicPath));
  
  // SPA Routing: Middleware final pour capturer toutes les routes non-API
  // Cette méthode évite les erreurs de syntaxe wildcard d'Express 5
  app.use((req, res, next) => {
    // Si c'est une requête API qui n'existe pas, on laisse l'errorHandler gérer
    if (req.path.startsWith('/api')) {
      return next();
    }
    // Pour tout le reste, on sert l'index.html de l'application Angular
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}
// Auth Routes
app.get('/api/auth/bnet', (req, res, next) => {
  const redirect = req.query.redirect as string;
  console.log(`[Auth] Login initiated. SessionID: ${req.sessionID}, Redirect Query: ${redirect}`);

  if (redirect && redirect.startsWith('/')) {
    req.session.redirect_after_login = redirect;
    console.log(`[Auth] Storing redirect in session: ${redirect}`);
    // On force la sauvegarde immédiate pour être sûr que le callback la retrouve
    req.session.save((err) => {
      if (err) console.error('[Auth] Error saving redirect to session:', err);
      passport.authenticate('bnet')(req, res, next);
    });
  } else {
    passport.authenticate('bnet')(req, res, next);
  }
});

app.get('/api/auth/bnet/callback', (req, res, next) => {
  // Capturer la redirection AVANT que passport ne régénère la session
  const savedRedirect = req.session.redirect_after_login;

  passport.authenticate('bnet', { failureRedirect: `${frontendUrl}/login` })(req, res, () => {
    let target = frontendUrl + '/';

    // Restaurer la redirection dans la nouvelle session
    if (savedRedirect) {
      target = frontendUrl + savedRedirect;
      // Pas besoin de le supprimer de la session car c'est une nouvelle session
    }

    req.session.save((err) => {
      if (err) {
        console.error('[Auth] Session save error in callback:', err);
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
      const dbUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.user!.id]);
      const user = dbUserRes.rows[0];
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const has_characters = await UserService.hasCharacters(user.id);
      
      let subscription_tier = 'none';
      let subscription_expires_at = null;
      let active_guild_is_paid = false;
      let active_guild_fees_enabled = true;
      let active_guild_minimum_fee_amount = 2000;
      if (user.active_guild_id) {
        const guildRes = await pool.query('SELECT subscription_tier, subscription_expires_at, fees_enabled, minimum_fee_amount FROM guilds WHERE id = $1', [user.active_guild_id]);
        if (guildRes.rows[0]) {
          subscription_tier = guildRes.rows[0].subscription_tier;
          subscription_expires_at = guildRes.rows[0].subscription_expires_at;
          active_guild_is_paid = subscription_expires_at ? (new Date(subscription_expires_at) > new Date()) : false;
          active_guild_fees_enabled = guildRes.rows[0].fees_enabled !== undefined ? guildRes.rows[0].fees_enabled : true;
          active_guild_minimum_fee_amount = guildRes.rows[0].minimum_fee_amount || 2000;
        }
      }

      res.json({
        ...user,
        has_characters,
        subscription_tier,
        subscription_expires_at,
        active_guild_is_paid,
        active_guild_fees_enabled,
        active_guild_minimum_fee_amount
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
