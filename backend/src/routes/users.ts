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

export default router;
