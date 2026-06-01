import express from 'express';
import pool from '../lib/db';
import { mockUsers, mockGuilds, mockCharacters } from '../lib/mockData';

const router = express.Router();

// GET /api/mock-auth/users : Renvoie la liste des utilisateurs mockés disponibles
router.get('/users', (req, res) => {
  const usersList = mockUsers.map(u => ({
    id: u.id,
    battletag: u.battletag,
    label: u.label
  }));
  res.json(usersList);
});

// POST /api/mock-auth/login : Effectue la connexion rapide (upsert les données mockées en BDD et initie la session passport)
router.post('/login', async (req, res, next) => {
  try {
    const { mockUserId } = req.body;
    const user = mockUsers.find(u => u.id === mockUserId);

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Mock user not found' });
    }

    // 1. Seed all mock guilds so they are available in /select-guild
    for (const guild of mockGuilds) {
      await pool.query(`
        INSERT INTO guilds (id, blizzard_id, name, realm, region, subscription_tier, subscription_expires_at, discord_enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (blizzard_id) DO UPDATE
        SET name = EXCLUDED.name, 
            realm = EXCLUDED.realm, 
            subscription_tier = EXCLUDED.subscription_tier, 
            subscription_expires_at = EXCLUDED.subscription_expires_at, 
            discord_enabled = EXCLUDED.discord_enabled,
            updated_at = CURRENT_TIMESTAMP
      `, [guild.id, guild.blizzard_id, guild.name, guild.realm, guild.region, guild.subscription_tier, guild.subscription_expires_at, guild.discord_enabled]);
    }

    // 2. Upsert the user (starting un-onboarded with no active guild and no rank, but with mock access token)
    await pool.query(`
      INSERT INTO users (id, bnet_id, battletag, role, rank, active_guild_id, access_token)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
      SET battletag = EXCLUDED.battletag, 
          role = EXCLUDED.role, 
          rank = EXCLUDED.rank, 
          active_guild_id = EXCLUDED.active_guild_id,
          access_token = EXCLUDED.access_token,
          updated_at = CURRENT_TIMESTAMP
    `, [user.id, user.bnet_id, user.battletag, user.role, null, null, user.id]);

    // 3. Clear any existing characters of this mock user in the database to simulate a fresh connection
    await pool.query('DELETE FROM characters WHERE user_id = $1', [user.id]);

    // 4. Connecter l'utilisateur via passport
    const dbUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const dbUser = dbUserRes.rows[0];

    req.login(dbUser, (err) => {
      if (err) return next(err);
      res.json({ status: 'success', user: dbUser });
    });
  } catch (error) {
    next(error);
  }
});

export default router;
