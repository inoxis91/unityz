import express from 'express';
import session from 'express-session';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Initialize Database
initDb();

// Initialize Discord & Cron
initDiscord();
initCronJobs();

app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:4200', 'https://unityz.up.railway.app'],
  credentials: true,
}));

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'unityz-secret',
  resave: false,
  saveUninitialized: false,
  proxy: process.env.NODE_ENV === 'production',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
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
app.get('/api/auth/bnet', passport.authenticate('bnet'));

app.get('/api/auth/bnet/callback',
  passport.authenticate('bnet', { failureRedirect: '/login' }),
  (req, res) => {
    let frontendBase = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (frontendBase.endsWith('/')) {
      frontendBase = frontendBase.slice(0, -1);
    }
    const target = `${frontendBase}/dashboard`;
    res.redirect(target);
  }
);

app.get('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return res.status(500).json({ status: 'error', message: 'Logout failed' }); }
    res.json({ status: 'success', message: 'Logged out successfully' });
  });
});

app.get('/api/users/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
