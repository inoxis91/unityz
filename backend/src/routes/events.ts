import express from 'express';
import { EventService } from '../services/eventService';
import { isAuthenticated, canManageEvents } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createEventSchema, updateEventSchema, signupSchema, updateSignupGroupSchema, updateGroupsCountSchema } from '../schemas/eventSchemas';

const router = express.Router();

// GET /api/events/my-signups : Récupère les inscriptions de l'utilisateur
router.get('/my-signups', isAuthenticated, async (req, res, next) => {
  try {
    const signups = await EventService.getMySignups(req.user!.id);
    res.json(signups);
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

// POST /api/events : Crée un événement (Admin, Raid Leader, Event Manager)
router.post('/', canManageEvents, validate(createEventSchema), async (req, res, next) => {
  try {
    const event = await EventService.create(req.body, req.user!.id);
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

// PUT /api/events/:id : Modifie un événement
router.put('/:id', canManageEvents, validate(updateEventSchema), async (req, res, next) => {
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

// DELETE /api/events/:id : Supprime un événement
router.delete('/:id', canManageEvents, async (req, res, next) => {
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

// PATCH /api/events/:id/groups-count : Met à jour le nombre de groupes MM+
router.patch('/:id/groups-count', canManageEvents, validate(updateGroupsCountSchema), async (req, res, next) => {
  try {
    const success = await EventService.updateGroupsCount(req.params.id as string, req.body.count);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }
    res.json({ status: 'success', message: 'Groups count updated' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/events/:id/signups/:userId/group : Déplace un utilisateur dans un groupe MM+
router.patch('/:id/signups/:userId/group', canManageEvents, validate(updateSignupGroupSchema), async (req, res, next) => {
  try {
    const success = await EventService.updateSignupGroup(req.params.id as string, req.params.userId as string, req.body.group_index);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Signup not found' });
    }
    res.json({ status: 'success', message: 'Signup group updated' });
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
