import express from 'express';
import pool from '../lib/db';
import { EventService } from '../services/eventService';
import { isAuthenticated, isAdmin } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createEventSchema, updateEventSchema, signupSchema } from '../schemas/eventSchemas';

const router = express.Router();

// GET /api/events/my-signups : Récupère les inscriptions de l'utilisateur
router.get('/my-signups', isAuthenticated, async (req, res, next) => {
  try {
    const query = 'SELECT * FROM event_signups WHERE user_id = $1';
    const result = await pool.query(query, [req.user!.id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/events : Récupère tous les événements
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const events = await EventService.getAll();
    res.json(events);
  } catch (error) {
    next(error);
  }
});

// GET /api/events/:id : Récupère un événement spécifique
router.get('/:id', isAuthenticated, async (req, res, next) => {
  try {
    const event = await EventService.getById(req.params.id as string);
    if (!event) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    next(error);
  }
});

// GET /api/events/:id/signups : Récupère les inscriptions pour un événement
router.get('/:id/signups', isAuthenticated, async (req, res, next) => {
  try {
    const signups = await EventService.getSignups(req.params.id as string);
    res.json(signups);
  } catch (error) {
    next(error);
  }
});

// POST /api/events : Crée un événement (Admin uniquement)
router.post('/', isAdmin, validate(createEventSchema), async (req, res, next) => {
  try {
    const event = await EventService.create(req.body, req.user!.id);
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

// PUT /api/events/:id : Modifie un événement (Admin uniquement)
router.put('/:id', isAdmin, validate(updateEventSchema), async (req, res, next) => {
  try {
    const event = await EventService.update(req.params.id as string, req.body);
    if (!event) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/events/:id : Supprime un événement (Admin uniquement)
router.delete('/:id', isAdmin, async (req, res, next) => {
  try {
    const success = await EventService.delete(req.params.id as string);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }
    res.json({ status: 'success', message: 'Event deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/events/:id/signup : S'inscrire à un événement
router.post('/:id/signup', isAuthenticated, validate(signupSchema), async (req, res, next) => {
  try {
    const signup = await EventService.signup(req.params.id as string, req.user!.id, req.body);
    res.json(signup);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/events/:id/signup : Se désinscrire d'un événement
router.delete('/:id/signup', isAuthenticated, async (req, res, next) => {
  try {
    const success = await EventService.unsignup(req.params.id as string, req.user!.id);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Signup not found' });
    }
    res.json({ status: 'success', message: 'Unsubscribed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
