import express from 'express';
import pool from '../lib/db';
import { EventService } from '../services/eventService';
import { isAuthenticated, canManageEvents, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createEventSchema, updateEventSchema, signupSchema, updateSignupGroupSchema, updateGroupsCountSchema } from '../schemas/eventSchemas';

const router = express.Router();

router.use(requireActiveGuild, requirePaidGuild);

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
    const userRole = req.user!.role || 'member';
    const events = await EventService.getAll(req.user!.active_guild_id || undefined, userRole);
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
    
    // Check 'reunion' visibility
    if (event.type === 'reunion' && event.invited_groups && event.invited_groups.length > 0) {
      const userRole = req.user!.role || 'member';
      const hasAccess = event.invited_groups.includes('all') || userRole === 'admin' || event.invited_groups.includes(userRole);
      if (!hasAccess) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: You are not invited to this meeting' });
      }
    }
    
    res.json(event);
  } catch (error) {
    next(error);
  }
});

// POST /api/events/:id/remind : Envoie un rappel manuel sur Discord (Admin/Manager)
router.post('/:id/remind', canManageEvents, async (req, res, next) => {
  try {
    const { id } = req.params;
    await EventService.sendManualReminder(id as string);
    res.json({ status: 'success', message: 'Reminder sent successfully' });
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
    const guildId = req.user!.active_guild_id!;
    const startTime = req.body.start_time;

    // Check subscription tier limit
    const guildRes = await pool.query('SELECT subscription_tier FROM guilds WHERE id = $1', [guildId]);
    const tier = guildRes.rows[0]?.subscription_tier || 'free';

    if (tier === 'free' || tier === 'medium') {
      const countRes = await pool.query(`
        SELECT COUNT(*) FROM events 
        WHERE guild_id = $1 
          AND DATE_TRUNC('month', start_time) = DATE_TRUNC('month', $2::timestamp)
      `, [guildId, startTime]);
      const count = parseInt(countRes.rows[0].count, 10);
      if (count >= 6) {
        return res.status(403).json({
          status: 'error',
          code: 'LIMIT_REACHED',
          message: 'You have reached the limit of 6 events per month for your subscription tier. Upgrade to Pro for unlimited events.'
        });
      }
    }

    const event = await EventService.create(req.body, req.user!.id, guildId);
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

// POST /api/events/:id/cancel : Annule un événement
router.post('/:id/cancel', canManageEvents, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const event = await EventService.cancel(id as string, reason || '');
    if (!event) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }
    
    res.json({ status: 'success', message: 'Event canceled successfully', event });
  } catch (error) {
    next(error);
  }
});

export default router;
