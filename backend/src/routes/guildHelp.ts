import express from 'express';
import { isAuthenticated, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  applyHelpPostSchema,
  createHelpPostSchema,
  decideHelpApplicationSchema,
  helpIdSchema,
  updateHelpPostSchema,
} from '../schemas/guildHelpSchemas';
import { GuildHelpService } from '../services/guildHelpService';
import { GuildHelpNotifier } from '../services/guildHelpNotifier';

const router = express.Router();

router.use(isAuthenticated, requireActiveGuild, requirePaidGuild);

// GET /api/guild-help : annonces ouvertes, candidatures reçues et binômes actifs de la guilde
router.get('/', async (req, res, next) => {
  try {
    res.json(await GuildHelpService.overview(req.user!.active_guild_id!, req.user!.id));
  } catch (error) {
    next(error);
  }
});

// POST /api/guild-help/posts : publie une demande ou une offre d'aide
router.post('/posts', validate(createHelpPostSchema), async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const input = createHelpPostSchema.shape.body.parse(req.body);
    const postId = await GuildHelpService.createPost(guildId, req.user!.id, input);
    GuildHelpNotifier.postCreated(postId);
    res.status(201).json(await GuildHelpService.getPost(guildId, req.user!.id, postId));
  } catch (error) {
    next(error);
  }
});

// PUT /api/guild-help/posts/:id : modifie son annonce
router.put('/posts/:id', validate(updateHelpPostSchema), async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const postId = req.params.id as string;
    const input = updateHelpPostSchema.shape.body.parse(req.body);
    await GuildHelpService.updatePost(guildId, req.user!.id, postId, input);
    res.json(await GuildHelpService.getPost(guildId, req.user!.id, postId));
  } catch (error) {
    next(error);
  }
});

// POST /api/guild-help/posts/:id/close : clôture (auteur ou modérateur), les binômes continuent
router.post('/posts/:id/close', validate(helpIdSchema), async (req, res, next) => {
  try {
    await GuildHelpService.closePost(req.user!.active_guild_id!, req.user!, req.params.id as string);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// POST /api/guild-help/posts/:id/applications : propose son aide (demande) ou s'inscrit (offre)
router.post('/posts/:id/applications', validate(applyHelpPostSchema), async (req, res, next) => {
  try {
    const input = applyHelpPostSchema.shape.body.parse(req.body);
    const applicationId = await GuildHelpService.apply(
      req.user!.active_guild_id!,
      req.user!.id,
      req.params.id as string,
      input,
    );
    GuildHelpNotifier.applicationReceived(applicationId);
    res.status(201).json({ id: applicationId });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/guild-help/posts/:id/applications/me : retire sa candidature en attente
router.delete('/posts/:id/applications/me', validate(helpIdSchema), async (req, res, next) => {
  try {
    await GuildHelpService.withdraw(req.user!.active_guild_id!, req.user!.id, req.params.id as string);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// POST /api/guild-help/applications/:id/decision : l'auteur accepte (binôme formé) ou refuse
router.post('/applications/:id/decision', validate(decideHelpApplicationSchema), async (req, res, next) => {
  try {
    const applicationId = req.params.id as string;
    const { decision } = decideHelpApplicationSchema.shape.body.parse(req.body);
    await GuildHelpService.decide(req.user!.active_guild_id!, req.user!.id, applicationId, decision);
    if (decision === 'accept') GuildHelpNotifier.applicationAccepted(applicationId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// POST /api/guild-help/pairs/:id/end : met fin à un binôme (un des deux membres ou modérateur)
router.post('/pairs/:id/end', validate(helpIdSchema), async (req, res, next) => {
  try {
    await GuildHelpService.endPair(req.user!.active_guild_id!, req.user!, req.params.id as string);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
