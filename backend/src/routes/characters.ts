import express, { Request } from 'express';
import pool from '../lib/db';
import { CharacterService } from '../services/characterService';
import { UserService, characterKey } from '../services/userService';
import { BlizzardService } from '../services/blizzardService';
import { isAuthenticated, requireActiveGuild, requirePaidGuild, canManageRosters } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  importCharactersSchema,
  updateRolesSchema,
  setMainSchema,
  wclRaidPerformanceSchema,
  wclMythicPlusPerformanceSchema,
} from '../schemas/characterSchemas';
import { WclCharacterRef, WclCharacterService } from '../services/wclCharacterService';
import { HttpError } from '../middlewares/errorHandler';
import { toRealmSlug } from '../lib/realm';
import { WowRegion, toWowRegion } from '../lib/regions';

const router = express.Router();

// GET /api/characters/details/:realm/:name : Récupère les détails (image, stuff) d'un personnage via Blizzard
router.get('/details/:realm/:name', isAuthenticated, requireActiveGuild, requirePaidGuild, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    const { realm, name } = req.params;
    const region = await activeGuildRegion(req.user!.active_guild_id!);

    const [media, equipment, summary] = await Promise.all([
      BlizzardService.getCharacterMedia(accessToken, region, realm as string, name as string),
      BlizzardService.getCharacterEquipment(accessToken, region, realm as string, name as string),
      BlizzardService.getCharacterSummary(accessToken, region, realm as string, name as string)
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

// GET /api/characters/bnet : personnages du compte Battle.net vérifiés dans la guilde active
router.get('/bnet', isAuthenticated, requireActiveGuild, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    const guild = await activeGuild(req.user!.active_guild_id!);
    const { characters } = await UserService.findGuildCharacters(req.user!.id, accessToken, guild);
    console.log(`[Bnet Sync] ${characters.length} character(s) of the account belong to guild '${guild.name}'.`);
    res.json(characters.map((char) => ({
      ...char,
      guild: { id: guild.blizzard_id, name: guild.name, realm: guild.realm, region: guild.region },
    })));
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

// GET /api/characters/guild-overview : Récupère tous les personnages de la guilde active (Admin / Raid Leader)
router.get('/guild-overview', isAuthenticated, requireActiveGuild, canManageRosters, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    const characters = await CharacterService.getAllForGuild(guildId);
    res.json(characters);
  } catch (error) {
    next(error);
  }
});

// GET /api/characters/guild-roster : Récupère tous les personnages de la guilde active (visible pour tous les membres)
router.get('/guild-roster', isAuthenticated, requireActiveGuild, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild selected' });
    }
    const characters = await CharacterService.getAllForGuild(guildId);
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
router.post('/import', isAuthenticated, requireActiveGuild, validate(importCharactersSchema), async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    // Jamais la guilde envoyée par le client : chaque personnage est revérifié dans la guilde active
    const guild = await activeGuild(req.user!.active_guild_id!);
    const requested = new Set(req.body.characters.map(characterKey));
    const { characters } = await UserService.findGuildCharacters(
      req.user!.id, accessToken, guild, (char) => requested.has(characterKey(char)),
    );
    if (characters.length === 0) {
      throw new HttpError(403, 'None of these characters belongs to your active guild', 'NOT_A_GUILD_MEMBER');
    }
    await CharacterService.importCharacters(req.user!.id, guild.id, characters);
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

async function activeGuild(guildId: string) {
  const guildRes = await pool.query('SELECT id, blizzard_id, name, realm, region FROM guilds WHERE id = $1', [guildId]);
  if (!guildRes.rows[0]) throw new HttpError(404, 'Active guild not found', 'GUILD_NOT_FOUND');
  return guildRes.rows[0] as { id: string; blizzard_id: number; name: string; realm: string; region: string };
}

async function activeGuildRegion(guildId: string): Promise<WowRegion> {
  return toWowRegion((await activeGuild(guildId)).region);
}

/** Personnage du joueur (guilde active) au format attendu par Warcraft Logs. */
async function resolveWclCharacter(req: Request): Promise<WclCharacterRef> {
  const guildId = req.user!.active_guild_id!;
  const chars = await CharacterService.getByUserId(req.user!.id, guildId);
  const character = chars.find((c) => c.id === req.params.id);
  if (!character) {
    throw new HttpError(404, 'Character not found', 'CHARACTER_NOT_FOUND');
  }

  return {
    name: character.name,
    realmSlug: toRealmSlug(character.realm),
    region: await activeGuildRegion(guildId),
    className: character.class,
  };
}

// GET /api/characters/:id/wcl/raid : parses Warcraft Logs du raid de la saison en cours
router.get(
  '/:id/wcl/raid',
  isAuthenticated, requireActiveGuild, requirePaidGuild, validate(wclRaidPerformanceSchema),
  async (req, res, next) => {
    try {
      const query = wclRaidPerformanceSchema.shape.query.parse(req.query);
      const ref = await resolveWclCharacter(req);
      res.json(await WclCharacterService.getRaidPerformance(ref, query));
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/characters/:id/wcl/mythic-plus : score et parses Mythique+ de la saison en cours
router.get(
  '/:id/wcl/mythic-plus',
  isAuthenticated, requireActiveGuild, requirePaidGuild, validate(wclMythicPlusPerformanceSchema),
  async (req, res, next) => {
    try {
      const { metric } = wclMythicPlusPerformanceSchema.shape.query.parse(req.query);
      const ref = await resolveWclCharacter(req);
      res.json(await WclCharacterService.getMythicPlusPerformance(ref, metric));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
