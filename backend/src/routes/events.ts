import express from 'express';
import pool from '../lib/db';
import { EventService } from '../services/eventService';
import { LineupService } from '../services/lineupService';
import { MplusGroupService } from '../services/mplusGroupService';
import { WclReportService } from '../services/wclReportService';
import { isAuthenticated, canManageEvents, canManageLineup, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createEventSchema, updateEventSchema, signupSchema, updateSignupGroupSchema, mplusGroupsSchema, deleteMplusGroupSchema, setGroupAssignmentsSchema, updateSignupSchema, updateLineupEntrySchema, bulkUpdateLineupSchema, eventLogsAnalysisSchema } from '../schemas/eventSchemas';

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

// GET /api/events/:id/logs-analysis : synthèse du rapport Warcraft Logs et classement MVP du raid
router.get('/:id/logs-analysis', isAuthenticated, validate(eventLogsAnalysisSchema), async (req, res, next) => {
  try {
    const { locale } = eventLogsAnalysisSchema.shape.query.parse(req.query);
    res.json(
      await WclReportService.getEventAnalysis(req.params.id as string, req.user!.active_guild_id!, locale),
    );
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

// POST /api/events/:id/groups : Ajoute un groupe MM+
router.post('/:id/groups', canManageEvents, validate(mplusGroupsSchema), async (req, res, next) => {
  try {
    res.status(201).json(await MplusGroupService.addGroup(req.user!.active_guild_id!, req.params.id as string));
  } catch (error) {
    next(error);
  }
});

// DELETE /api/events/:id/groups/:index : Supprime un groupe MM+ et renumérote les suivants
router.delete('/:id/groups/:index', canManageEvents, validate(deleteMplusGroupSchema), async (req, res, next) => {
  try {
    const index = Number(req.params.index);
    res.json(await MplusGroupService.deleteGroup(req.user!.active_guild_id!, req.params.id as string, index));
  } catch (error) {
    next(error);
  }
});

// PUT /api/events/:id/groups/assignments : Placement groupé (remplissage automatique, réinitialisation)
router.put('/:id/groups/assignments', canManageEvents, validate(setGroupAssignmentsSchema), async (req, res, next) => {
  try {
    res.json(
      await MplusGroupService.setAssignments(req.user!.active_guild_id!, req.params.id as string, req.body.assignments),
    );
  } catch (error) {
    next(error);
  }
});

// PATCH /api/events/:id/signups/:userId/group : Déplace un joueur dans un groupe MM+ (0 = sans groupe)
router.patch('/:id/signups/:userId/group', canManageEvents, validate(updateSignupGroupSchema), async (req, res, next) => {
  try {
    res.json(
      await MplusGroupService.moveSignup(
        req.user!.active_guild_id!,
        req.params.id as string,
        req.params.userId as string,
        req.body.group_index,
      ),
    );
  } catch (error) {
    next(error);
  }
});

// PATCH /api/events/:id/signups/:userId : Met à jour l'inscription d'un utilisateur (Admin/Manager)
router.patch('/:id/signups/:userId', canManageEvents, validate(updateSignupSchema), async (req, res, next) => {
  try {
    const success = await EventService.updateSignup(req.params.id as string, req.params.userId as string, req.body);
    if (!success) {
      return res.status(404).json({ status: 'error', message: 'Signup not found' });
    }
    res.json({ status: 'success', message: 'Signup updated successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/events/:id/lineup : Sélection groupée (validé / banc / en attente) pour un raid (Admin/Raid Leader)
router.patch('/:id/lineup', canManageLineup, validate(bulkUpdateLineupSchema), async (req, res, next) => {
  try {
    const entries = await LineupService.bulkUpdateSelection(
      req.user!.active_guild_id!,
      req.params.id as string,
      req.body.user_ids,
      req.body.selection,
    );
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/events/:id/lineup/:userId : Sélection et/ou rôle imposé d'un joueur pour un raid (Admin/Raid Leader)
router.patch('/:id/lineup/:userId', canManageLineup, validate(updateLineupEntrySchema), async (req, res, next) => {
  try {
    const entry = await LineupService.updateEntry(
      req.user!.active_guild_id!,
      req.params.id as string,
      req.params.userId as string,
      req.body,
    );
    res.json(entry);
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

// POST /api/events/:id/toggle-lock : Bloque/Débloque les inscriptions à un événement
router.post('/:id/toggle-lock', canManageEvents, async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await EventService.toggleRegistrationLock(id as string);
    if (!event) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }
    res.json(event);
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
