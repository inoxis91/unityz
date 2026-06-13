import express from 'express';
import pool from '../lib/db';
import { isAuthenticated, isAdmin } from '../middlewares/auth';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { findMemberByName } from '../lib/discord';
import { UserService } from '../services/userService';
import { CharacterService } from '../services/characterService';

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

// GET /api/users : Liste tous les utilisateurs de la guilde active (Admin)
router.get('/', isAdmin, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    const users = await UserService.getAllForGuild(guildId);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/characters : Liste les personnages d'un utilisateur (Admin)
router.get('/:id/characters', isAdmin, async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    const characters = await CharacterService.getByUserId(userId, guildId);
    res.json(characters);
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

// DELETE /api/users/:id : Supprime un utilisateur (Admin)
router.delete('/:id', isAdmin, async (req, res, next) => {
  try {
    const id = req.params.id as string;

    // Sécurité: Un admin ne peut pas se supprimer lui-même via cette route
    if (id === req.user!.id) {
      return res.status(400).json({ status: 'error', message: 'You cannot delete your own account.' });
    }

    const success = await UserService.deleteUser(id);

    if (!success) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    res.json({ status: 'success', message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/discord : Met à jour son propre ID Discord
router.patch('/discord', isAuthenticated, validate(updateDiscordSchema), async (req, res, next) => {
  try {
    const discordId = req.body.discordId;
    
    // Only block if trying to LINK (discordId is not null). Detaching (discordId is null) is always allowed.
    if (discordId !== null) {
      const guildId = req.user!.active_guild_id;
      if (guildId) {
        const guildRes = await pool.query('SELECT subscription_tier FROM guilds WHERE id = $1', [guildId]);
        const tier = guildRes.rows[0]?.subscription_tier || 'free';
        if (tier !== 'pro') {
          return res.status(403).json({
            status: 'error',
            code: 'PRO_FEATURE_REQUIRED',
            message: 'Personal Discord notification is a Pro feature. Please upgrade your subscription.'
          });
        }
      }
    }

    const user = await UserService.updateDiscordId(req.user!.id, discordId);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

const updateBirthdaySchema = z.object({
  body: z.object({
    birthday: z.string().nullable().refine((val) => {
      if (val === null) return true;
      return !isNaN(Date.parse(val));
    }, {
      message: "Invalid date format",
    }),
  }),
});

// PATCH /api/users/birthday : Met à jour sa propre date d'anniversaire
router.patch('/birthday', isAuthenticated, validate(updateBirthdaySchema), async (req, res, next) => {
  try {
    const { birthday } = req.body;
    const user = await UserService.updateBirthday(req.user!.id, birthday);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/active-guild/birthdays : Récupère les anniversaires du mois en cours pour la guilde active
router.get('/active-guild/birthdays', isAuthenticated, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    const birthdays = await UserService.getGuildBirthdaysThisMonth(guildId);
    res.json(birthdays);
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
    const guildId = req.user!.active_guild_id;
    if (guildId) {
      const guildRes = await pool.query('SELECT subscription_tier FROM guilds WHERE id = $1', [guildId]);
      const tier = guildRes.rows[0]?.subscription_tier || 'free';
      if (tier !== 'pro') {
        return res.status(403).json({
          status: 'error',
          code: 'PRO_FEATURE_REQUIRED',
          message: 'Discord linking is a Pro feature. Please upgrade your subscription.'
        });
      }
    }

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

// GET /api/users/me/guilds : Liste les guildes associées aux personnages de l'utilisateur
router.get('/me/guilds', isAuthenticated, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }
    const guilds = await UserService.discoverUserGuilds(accessToken);
    res.json(guilds);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/me/attendance : Récupère les statistiques d'assiduité de l'utilisateur pour le mois en cours
router.get('/me/attendance', isAuthenticated, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    const attendance = await UserService.getUserAttendance(req.user!.id, guildId);
    res.json(attendance);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/me/active-guild : Récupère la guilde active courante
router.get('/me/active-guild', isAuthenticated, async (req, res, next) => {
  try {
    const guild = await UserService.getActiveGuild(req.user!.id);
    res.json(guild);
  } catch (error) {
    next(error);
  }
});

const updateActiveGuildSchema = z.object({
  body: z.object({
    guildId: z.string().min(1).max(255), // Can be a standard UUID or virtual UUID (00000000-0000-0000-0000-...)
  }),
});

// POST /api/users/active-guild : Met à jour la guilde active de l'utilisateur et renvoie les personnages correspondants
router.post('/active-guild', isAuthenticated, validate(updateActiveGuildSchema), async (req, res, next) => {
  try {
    const { guildId } = req.body;
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }
    const characters = await UserService.fetchGuildCharacters(req.user!.id, guildId, accessToken);
    res.json({ status: 'success', characters });
  } catch (error) {
    next(error);
  }
});

const importCharactersSchema = z.object({
  body: z.object({
    characters: z.array(z.object({
      name: z.string().min(2).max(100),
      realm: z.string().min(2).max(100),
      class: z.string().min(2).max(100),
      level: z.number().int().min(1),
      is_main: z.boolean().optional(),
    })).min(1),
  }),
});

// POST /api/users/import-characters : Importe les personnages sélectionnés et définit le personnage principal
router.post('/import-characters', isAuthenticated, validate(importCharactersSchema), async (req, res, next) => {
  try {
    const { characters } = req.body;
    const guildId = req.user!.active_guild_id;
    const accessToken = req.user!.access_token;

    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    await UserService.importSelectedCharacters(req.user!.id, guildId, accessToken, characters);
    res.json({ status: 'success', message: 'Characters imported successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
