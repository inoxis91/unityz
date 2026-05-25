import passport from 'passport';
import { Strategy as BnetStrategy } from 'passport-bnet';
import { Strategy as DiscordStrategy } from 'passport-discord';
import pool from '../lib/db';
import dotenv from 'dotenv';

dotenv.config();

const BNET_CLIENT_ID = process.env.BNET_CLIENT_ID;
const BNET_CLIENT_SECRET = process.env.BNET_CLIENT_SECRET;
const BNET_CALLBACK_URL = process.env.BNET_CALLBACK_URL || 'http://localhost:3000/api/auth/bnet/callback';
const BNET_REGION = 'eu';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/api/auth/discord/callback';

// Stratégie Battle.net (Connexion principale)
if (BNET_CLIENT_ID && BNET_CLIENT_SECRET) {
  passport.use(
    new BnetStrategy(
      {
        clientID: BNET_CLIENT_ID,
        clientSecret: BNET_CLIENT_SECRET,
        callbackURL: BNET_CALLBACK_URL,
        region: BNET_REGION,
        state: true,
        scope: ['wow.profile']
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const bnetId = parseInt(profile.id, 10);
          const battletag = profile.battletag;
          const tokenToStore = accessToken || profile.token;

          const query = `
            INSERT INTO users (id, bnet_id, battletag, access_token, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (bnet_id) 
            DO UPDATE SET 
              battletag = EXCLUDED.battletag,
              access_token = EXCLUDED.access_token,
              updated_at = CURRENT_TIMESTAMP
            RETURNING *;
          `;
          
          const res = await pool.query(query, [profile.id.toString(), bnetId, battletag, tokenToStore]);
          const user = res.rows[0];
          return done(null, user);
        } catch (error) {
          console.error('Error during auth with DB:', error);
          return done(error);
        }
      }
    )
  );
} else {
  console.warn('⚠️ BNET_CLIENT_ID or BNET_CLIENT_SECRET not found. Battle.net login disabled.');
}

// Stratégie Discord (Liaison de compte uniquement)
if (DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: DISCORD_CLIENT_ID,
        clientSecret: DISCORD_CLIENT_SECRET,
        callbackURL: DISCORD_CALLBACK_URL,
        scope: ['identify'],
        passReqToCallback: true
      },
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          // L'utilisateur doit déjà être connecté via Bnet pour lier son Discord
          if (req.user) {
            const query = 'UPDATE users SET discord_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
            const res = await pool.query(query, [profile.id, req.user.id]);
            return done(null, res.rows[0]);
          }
          return done(new Error('User must be logged in via Battle.net to link Discord'));
        } catch (error) {
          return done(error);
        }
      }
    )
  );
} else {
  console.warn('⚠️ DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET not found. Discord linking disabled.');
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = res.rows[0];
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

export default passport;
