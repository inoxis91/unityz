import express from 'express';
import pool from '../lib/db';
import { isAuthenticated } from '../middlewares/auth';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { findMemberByName } from '../lib/discord';
import { isAdmin } from '../middlewares/auth';

const router = express.Router();

const updateDiscordSchema = z.object({
  body: z.object({
    discordId: z.string().min(1).max(255).nullable(),
  }),
});

router.patch('/discord', isAuthenticated, validate(updateDiscordSchema), async (req, res, next) => {
  try {
    const query = 'UPDATE users SET discord_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [req.body.discordId, req.user!.id]);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/sync-discord : Synchronisation globale Discord (Admin)
router.get('/sync-discord', isAdmin, async (req, res, next) => {
  try {
    const usersRes = await pool.query('SELECT id, battletag, discord_id FROM users');
    let linkedCount = 0;

    for (const user of usersRes.rows) {
      if (!user.discord_id) {
        const namePrefix = user.battletag.split('#')[0];
        // On cherche par BattleTag
        let discordId = await findMemberByName(namePrefix);
        
        // Si pas trouvé, on cherche par le nom du personnage principal (si existant)
        if (!discordId) {
          const mainCharRes = await pool.query('SELECT name FROM characters WHERE user_id = $1 AND is_main = TRUE', [user.id]);
          if (mainCharRes.rows[0]) {
            discordId = await findMemberByName(mainCharRes.rows[0].name);
          }
        }

        if (discordId) {
          await pool.query('UPDATE users SET discord_id = $1 WHERE id = $2', [discordId, user.id]);
          linkedCount++;
        }
      }
    }
    res.json({ status: 'success', message: `${linkedCount} utilisateurs liés automatiquement.` });
  } catch (error) {
    next(error);
  }
});

export default router;
