import express from 'express';
import { isAuthenticated, isAdmin } from '../middlewares/auth';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { findMemberByName } from '../lib/discord';
import { UserService } from '../services/userService';

const router = express.Router();

const updateDiscordSchema = z.object({
  body: z.object({
    discordId: z.string().min(1).max(255).nullable(),
  }),
});

const updateRoleSchema = z.object({
  body: z.object({
    role: z.enum(['admin', 'raid_leader', 'treasurer', 'event_manager', 'member']),
  }),
});

// GET /api/users : Liste tous les utilisateurs (Admin)
router.get('/', isAdmin, async (req, res, next) => {
  try {
    const users = await UserService.getAll();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id/role : Change le rôle d'un utilisateur (Admin)
router.patch('/:id/role', isAdmin, validate(updateRoleSchema), async (req, res, next) => {
  try {
    const { role } = req.body;
    const id = req.params.id as string;

    const user = await UserService.updateRole(id, role);

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/discord : Met à jour son propre ID Discord
router.patch('/discord', isAuthenticated, validate(updateDiscordSchema), async (req, res, next) => {
  try {
    const user = await UserService.updateDiscordId(req.user!.id, req.body.discordId);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

const linkDiscordSchema = z.object({
  body: z.object({
    pseudo: z.string().min(2).max(100),
  }),
});

// POST /api/users/link-discord : Lie son compte Discord par pseudo
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

    const user = await UserService.updateDiscordId(req.user!.id, discordId);
    res.json({ status: 'success', user });
  } catch (error) {
    next(error);
  }
});

export default router;
