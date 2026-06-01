import express from 'express';
import axios from 'axios';
import pool from '../lib/db';
import { CharacterService } from '../services/characterService';
import { BlizzardService } from '../services/blizzardService';
import { isAuthenticated, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { importCharactersSchema, updateRolesSchema, setMainSchema } from '../schemas/characterSchemas';

const router = express.Router();

// GET /api/characters/details/:realm/:name : Récupère les détails (image, stuff) d'un personnage via Blizzard
router.get('/details/:realm/:name', isAuthenticated, requireActiveGuild, requirePaidGuild, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    const { realm, name } = req.params;

    const [media, equipment, summary] = await Promise.all([
      BlizzardService.getCharacterMedia(accessToken, realm as string, name as string),
      BlizzardService.getCharacterEquipment(accessToken, realm as string, name as string),
      BlizzardService.getCharacterSummary(accessToken, realm as string, name as string)
    ]);

    res.json({
      media,
      equipment,
      summary
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/characters/bnet : Récupère les personnages de l'utilisateur via Blizzard, filtrés par sa guilde active
router.get('/bnet', isAuthenticated, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }

    const guildRes = await pool.query('SELECT blizzard_id, name FROM guilds WHERE id = $1', [guildId]);
    const guild = guildRes.rows[0];
    if (!guild) {
      return res.status(404).json({ status: 'error', message: 'Active guild not found' });
    }

    if (accessToken.startsWith('mock_')) {
      const { mockCharacters } = require('../lib/mockData');
      const filtered = mockCharacters.filter((c: any) => c.user_id === req.user!.id && c.guild_id === guildId).map((c: any) => ({
        name: c.name,
        realm: c.realm,
        class: c.class,
        level: c.level,
        guild: {
          id: guild.blizzard_id,
          name: guild.name,
          realm: c.realm
        }
      }));
      return res.json(filtered);
    }

    const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { namespace: 'profile-eu', locale: 'fr_FR' }
    });

    const accounts = response.data.wow_accounts || [];
    let allCharacters: any[] = [];

    accounts.forEach((account: any) => {
      if (account.characters) {
        account.characters.forEach((char: any) => {
          // Optimization: Only list characters level 10+ to avoid rate limiting on summaries
          if (char.name && (char.level || 0) >= 10) {
            allCharacters.push({
              name: char.name,
              realm: char.realm?.name || 'Inconnu',
              class: (char.character_class?.name || char.playable_class?.name || 'Inconnu'),
              level: char.level || 0,
              guild: null
            });
          }
        });
      }
    });

    // Fetch summaries in parallel and filter by active guild's blizzard ID
    const matchingCharacters: any[] = [];
    await Promise.all(
      allCharacters.map(async (char) => {
        try {
          const summary = await BlizzardService.getCharacterSummary(accessToken, char.realm, char.name);
          if (summary && summary.guild && summary.guild.id === guild.blizzard_id) {
            char.guild = {
              id: summary.guild.id,
              name: summary.guild.name,
              realm: summary.guild.realm?.name || char.realm
            };
            matchingCharacters.push(char);
          }
        } catch (err) {
          // Ignore, keep guild as null
        }
      })
    );

    res.json(matchingCharacters);
  } catch (error) {
    next(error);
  }
});

// GET /api/characters : Récupère les personnages de l'utilisateur stockés en DB
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const characters = await CharacterService.getByUserId(req.user!.id, req.user!.active_guild_id || undefined);
    res.json(characters);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/characters/:id/main : Définit un personnage comme "Main"
router.patch('/:id/main', isAuthenticated, requireActiveGuild, requirePaidGuild, validate(setMainSchema), async (req, res, next) => {
  try {
    const character = await CharacterService.setMain(req.params.id as string, req.user!.id);
    res.json(character);
  } catch (error) {
    next(error);
  }
});

// POST /api/characters/import : Importe les personnages sélectionnés
router.post('/import', isAuthenticated, validate(importCharactersSchema), async (req, res, next) => {
  try {
    await CharacterService.importCharacters(req.user!.id, req.body.characters);
    res.json({ status: 'success', message: 'Characters imported successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/characters/:id/roles : Met à jour les rôles d'un personnage
router.patch('/:id/roles', isAuthenticated, requireActiveGuild, requirePaidGuild, validate(updateRolesSchema), async (req, res, next) => {
  try {
    const character = await CharacterService.updateRoles(req.params.id as string, req.user!.id, req.body);
    res.json(character);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/characters/:id : Supprime un personnage de la base
router.delete('/:id', isAuthenticated, requireActiveGuild, requirePaidGuild, async (req, res, next) => {
  try {
    await CharacterService.remove(req.params.id as string, req.user!.id);
    res.json({ status: 'success', message: 'Character removed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
