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

const linkDiscordSchema = z.object({
  body: z.object({
    pseudo: z.string().min(2).max(100),
  }),
});

router.post('/link-discord', isAuthenticated, validate(linkDiscordSchema), async (req, res, next) => {
  try {
    const { pseudo } = req.body;
    const discordId = await findMemberByName(pseudo);
    
    if (!discordId) {
      return res.status(404).json({ 
        status: 'error', 
        message: `Membre '${pseudo}' introuvable sur le serveur Discord. Vérifiez l'orthographe ou assurez-vous d'avoir rejoint le serveur.` 
      });
    }

    const query = 'UPDATE users SET discord_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [discordId, req.user!.id]);
    res.json({ status: 'success', user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
