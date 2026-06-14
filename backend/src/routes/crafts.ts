import express from 'express';
import { isAuthenticated, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { z } from 'zod';
import { CraftService } from '../services/craftService';

const router = express.Router();

// Apply global middlewares for safety
router.use(isAuthenticated, requireActiveGuild, requirePaidGuild);

const createCraftRequestSchema = z.object({
  body: z.object({
    slot: z.string().min(1, 'Slot is required').max(100),
    armorType: z.string().min(1, 'Armor type is required').max(100),
  }),
});

const completeCraftRequestSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

// GET /api/crafts/pending : Get all pending craft requests
router.get('/pending', async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const requests = await CraftService.getPending(guildId);
    res.json(requests);
  } catch (error) {
    next(error);
  }
});

// POST /api/crafts : Create a new craft request
router.post('/', validate(createCraftRequestSchema), async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const userId = req.user!.id;
    const { slot, armorType } = req.body;

    const request = await CraftService.create(guildId, userId, slot, armorType);
    res.status(201).json({ status: 'success', data: request });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/crafts/:id : Complete/delete a craft request
router.delete('/:id', validate(completeCraftRequestSchema), async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const id = req.params.id as string;

    const success = await CraftService.complete(id, guildId);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Craft request not found or already completed.' });
    }

    res.json({ status: 'success', message: 'Craft request completed successfully.' });
  } catch (error) {
    next(error);
  }
});

export default router;
