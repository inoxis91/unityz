import express from 'express';
import axios from 'axios';
import pool from '../lib/db';
import { CharacterService } from '../services/characterService';
import { BlizzardService } from '../services/blizzardService';
import { isAuthenticated, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { importCharactersSchema, updateRolesSchema, setMainSchema } from '../schemas/characterSchemas';
import { WclService } from '../services/wclService';

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
              realmSlug: char.realm?.slug || null,
              class: (char.character_class?.name || char.playable_class?.name || 'Inconnu'),
              level: char.level || 0,
              guild: null
            });
          }
        });
      }
    });

    console.log(`[Bnet Sync] Found ${allCharacters.length} characters (>= level 10) on Bnet account.`);

    // Fetch summaries in parallel and filter by active guild's blizzard ID
    const matchingCharacters: any[] = [];
    await Promise.all(
      allCharacters.map(async (char) => {
        try {
          const summary = await BlizzardService.getCharacterSummary(accessToken, char.realmSlug || char.realm, char.name);
          if (!summary) {
            console.log(`[Bnet Sync] Could not fetch summary for character: ${char.name}-${char.realm}. Character might be inactive or has third-party data sharing disabled in Battle.net settings.`);
            return;
          }
          if (!summary.guild) {
            console.log(`[Bnet Sync] Character ${char.name}-${char.realm} is not in any guild.`);
            return;
          }
          if (summary.guild.id !== guild.blizzard_id) {
            console.log(`[Bnet Sync] Character ${char.name}-${char.realm} is in guild '${summary.guild.name}' (ID: ${summary.guild.id}) but active guild is '${guild.name}' (ID: ${guild.blizzard_id}).`);
            return;
          }

          console.log(`[Bnet Sync] Match found! Character ${char.name}-${char.realm} belongs to the active guild.`);
          char.guild = {
            id: summary.guild.id,
            name: summary.guild.name,
            realm: summary.guild.realm?.name || char.realm
          };
          matchingCharacters.push(char);
        } catch (err: any) {
          console.error(`[Bnet Sync] Error checking character ${char.name}-${char.realm}:`, err.message);
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

// GET /api/characters/:id/parses : Récupère les parses Warcraft Logs d'un personnage
router.get('/:id/parses', isAuthenticated, requireActiveGuild, requirePaidGuild, async (req, res, next) => {
  try {
    const { id } = req.params;
    let character;

    if (id === 'main') {
      const chars = await CharacterService.getByUserId(req.user!.id, req.user!.active_guild_id || undefined);
      character = chars.find(c => c.is_main) || chars[0];
    } else {
      const chars = await CharacterService.getByUserId(req.user!.id, req.user!.active_guild_id || undefined);
      character = chars.find(c => c.id === id);
    }

    if (!character) {
      return res.status(404).json({ status: 'error', message: 'Character not found' });
    }

    const guildId = req.user!.active_guild_id;
    let region = 'eu';
    if (guildId) {
      const guildRes = await pool.query('SELECT region FROM guilds WHERE id = $1', [guildId]);
      if (guildRes.rowCount! > 0 && guildRes.rows[0].region) {
        region = guildRes.rows[0].region;
      }
    }

    const realmSlug = character.realm.toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    const difficultyParam = req.query.difficulty ? parseInt(req.query.difficulty as string, 10) : undefined;
    const parses = await WclService.getCharacterParses(character.name, realmSlug, region, character.class, difficultyParam);
    res.json(parses);
  } catch (error) {
    next(error);
  }
});

export default router;
