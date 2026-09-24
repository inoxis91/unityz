import express from 'express';
import pool from '../lib/db';
import { RosterService } from '../services/rosterService';
import { canManageRosters, isAuthenticated, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createRosterSchema, updateRosterSchema, assignCharacterSchema } from '../schemas/rosterSchemas';

const router = express.Router();

router.use(requireActiveGuild, requirePaidGuild);

// GET /api/rosters/my-roster : Récupère le roster du personnage principal de l'utilisateur
router.get('/my-roster', isAuthenticated, async (req, res, next) => {
  try {
    const query = `
      SELECT r.* 
      FROM rosters r
      JOIN characters c ON r.id = c.roster_id
      WHERE c.user_id = $1 AND c.is_main = TRUE
    `;
    const result = await pool.query(query, [req.user!.id]);
    res.json(result.rows[0] || null);
  } catch (error) {
    next(error);
  }
});

// GET /api/rosters : Récupère tous les rosters avec leurs personnages
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const rosters = await RosterService.getAll(req.user!.active_guild_id || undefined);
    res.json(rosters);
  } catch (error) {
    next(error);
  }
});

// GET /api/rosters/unassigned : Récupère les personnages sans roster
router.get('/unassigned', canManageRosters, async (req, res, next) => {
  try {
    const characters = await RosterService.getUnassignedCharacters(req.user!.active_guild_id || undefined);
    res.json(characters);
  } catch (error) {
    next(error);
  }
});

// POST /api/rosters : Crée un roster
router.post('/', canManageRosters, validate(createRosterSchema), async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const roster = await RosterService.create(req.body, guildId);
    res.status(201).json(roster);
  } catch (error) {
    next(error);
  }
});

// PUT /api/rosters/:id : Modifie un roster
router.put('/:id', canManageRosters, validate(updateRosterSchema), async (req, res, next) => {
  try {
    const roster = await RosterService.update(req.params.id as string, req.body, req.user!.active_guild_id!);
    if (!roster) {
      return res.status(404).json({ status: 'error', message: 'Roster not found' });
    }
    res.json(roster);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/rosters/:id : Supprime un roster
router.delete('/:id', canManageRosters, async (req, res, next) => {
  try {
    const success = await RosterService.delete(req.params.id as string, req.user!.active_guild_id!);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Roster not found' });
    }
    res.json({ status: 'success', message: 'Roster deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/rosters/assign/:characterId : Assigne un personnage à un roster
router.patch('/assign/:characterId', canManageRosters, validate(assignCharacterSchema), async (req, res, next) => {
  try {
    const success = await RosterService.assignCharacter(
      req.params.characterId as string,
      req.body.rosterId,
      req.user!.active_guild_id!,
      req.body.role,
    );
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Character or roster not found' });
    }
    res.json({ status: 'success', message: 'Character assigned successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
