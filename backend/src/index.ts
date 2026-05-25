import express from 'express';
import session from 'express-session';
import passport from './config/passport';
import cors from 'cors';
import dotenv from 'dotenv';

import pool, { initDb } from './lib/db';
import characterRoutes from './routes/characters';
import eventRoutes from './routes/events';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Initialize Database
initDb();

console.log('--- Production Config Check ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('BNET_CALLBACK_URL:', process.env.BNET_CALLBACK_URL);
console.log('-------------------------------');

app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:4200', 'https://unityz.up.railway.app'],
  credentials: true,
}));

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'unityz-secret',
  resave: false,
  saveUninitialized: false,
  proxy: process.env.NODE_ENV === 'production', // Nécessaire pour Railway/HTTPS
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Permet le cookie cross-domain si besoin
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/characters', characterRoutes);
app.use('/api/events', eventRoutes);

// Auth Routes
app.get('/api/auth/bnet', passport.authenticate('bnet'));

app.get('/api/auth/bnet/callback',
  passport.authenticate('bnet', { failureRedirect: '/login' }),
  (req, res) => {
    // Nettoie l'URL pour éviter les doubles slashes
    let frontendBase = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (frontendBase.endsWith('/')) {
      frontendBase = frontendBase.slice(0, -1);
    }
    const target = `${frontendBase}/dashboard`;
    
    console.log('Redirecting to:', target);
    res.redirect(target);
  }
);

app.get('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return res.status(500).json({ message: 'Logout failed' }); }
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/users/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
