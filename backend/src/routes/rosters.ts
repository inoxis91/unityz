import express from 'express';
import pool from '../lib/db';
import { RosterService } from '../services/rosterService';
import { isAdmin, isAuthenticated } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createRosterSchema, updateRosterSchema, assignCharacterSchema } from '../schemas/rosterSchemas';

const router = express.Router();

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
router.get('/', isAdmin, async (req, res, next) => {
  try {
    const rosters = await RosterService.getAll();
    res.json(rosters);
  } catch (error) {
    next(error);
  }
});

// GET /api/rosters/unassigned : Récupère les personnages sans roster
router.get('/unassigned', isAdmin, async (req, res, next) => {
  try {
    const characters = await RosterService.getUnassignedCharacters();
    res.json(characters);
  } catch (error) {
    next(error);
  }
});

// POST /api/rosters : Crée un roster
router.post('/', isAdmin, validate(createRosterSchema), async (req, res, next) => {
  try {
    const roster = await RosterService.create(req.body);
    res.status(201).json(roster);
  } catch (error) {
    next(error);
  }
});

// PUT /api/rosters/:id : Modifie un roster
router.put('/:id', isAdmin, validate(updateRosterSchema), async (req, res, next) => {
  try {
    const roster = await RosterService.update(req.params.id as string, req.body);
    if (!roster) {
      return res.status(404).json({ status: 'error', message: 'Roster not found' });
    }
    res.json(roster);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/rosters/:id : Supprime un roster
router.delete('/:id', isAdmin, async (req, res, next) => {
  try {
    const success = await RosterService.delete(req.params.id as string);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Roster not found' });
    }
    res.json({ status: 'success', message: 'Roster deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/rosters/assign/:characterId : Assigne un personnage à un roster
router.patch('/assign/:characterId', isAdmin, validate(assignCharacterSchema), async (req, res, next) => {
  try {
    const success = await RosterService.assignCharacter(req.params.characterId as string, req.body.rosterId);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Character not found' });
    }
    res.json({ status: 'success', message: 'Character assigned successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
