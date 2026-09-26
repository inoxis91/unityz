import express, { Request } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { audit, requirePlatformAdmin } from '../middlewares/platform';
import { track } from '../services/analytics';
import {
  applyGuildAction,
  exportGuildsCsv,
  getGuildDetail,
  listAudit,
  listGuilds,
  saveGuildNote,
} from '../services/platformGuildService';
import { getFunnel, getHealth, getOverview, getReasons, getUsage } from '../services/platformStatsService';
import {
  auditSchema,
  funnelSchema,
  guildActionSchema,
  guildExportSchema,
  guildIdSchema,
  guildListSchema,
  guildNoteSchema,
  overviewSchema,
  reasonsSchema,
} from '../schemas/platformSchemas';

/**
 * Back-office du créateur du site (/api/platform). Toutes les routes passent par
 * requirePlatformAdmin : 404 pour les autres, requêtes du site uniquement, connexion récente.
 */
const router = express.Router();
router.use(requirePlatformAdmin);

/** Valeurs validées et converties (validate() ne fait que refuser les entrées invalides). */
const parsed = <S extends z.ZodType>(schema: S, req: Request): z.infer<S> =>
  schema.parse({ query: req.query, params: req.params, body: req.body });

router.get('/overview', validate(overviewSchema), async (req, res, next) => {
  try {
    res.json(await getOverview(parsed(overviewSchema, req).query.days));
  } catch (error) {
    next(error);
  }
});

router.get('/funnel', validate(funnelSchema), async (req, res, next) => {
  try {
    const { days, region } = parsed(funnelSchema, req).query;
    res.json(await getFunnel({ days: days === 'all' ? null : days, region }));
  } catch (error) {
    next(error);
  }
});

router.get('/usage', async (_req, res, next) => {
  try {
    res.json(await getUsage());
  } catch (error) {
    next(error);
  }
});

router.get('/reasons', validate(reasonsSchema), async (req, res, next) => {
  try {
    res.json(await getReasons(parsed(reasonsSchema, req).query.days));
  } catch (error) {
    next(error);
  }
});

router.get('/health', async (_req, res, next) => {
  try {
    res.json(await getHealth());
  } catch (error) {
    next(error);
  }
});

router.get('/guilds', validate(guildListSchema), async (req, res, next) => {
  try {
    res.json(await listGuilds(parsed(guildListSchema, req).query));
  } catch (error) {
    next(error);
  }
});

router.get('/guilds/export', validate(guildExportSchema), async (req, res, next) => {
  try {
    const query = parsed(guildExportSchema, req).query;
    const csv = await exportGuildsCsv(query);
    await audit(req, 'guilds_exported', { details: { filters: query } });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="guilds-${date}.csv"`);
    // BOM : accents lus correctement par Excel
    res.send(`﻿${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get('/guilds/:id', validate(guildIdSchema), async (req, res, next) => {
  try {
    const { id } = parsed(guildIdSchema, req).params;
    const detail = await getGuildDetail(id);
    await audit(req, 'guild_viewed', { guildId: id });
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.post('/guilds/:id/actions', validate(guildActionSchema), async (req, res, next) => {
  try {
    const { params, body } = parsed(guildActionSchema, req);
    const result = await applyGuildAction(params.id, body);
    const details = { ...body, ...result };
    await audit(req, body.type, { guildId: params.id, details });
    track('platform_action', { userId: req.user!.id, guildId: params.id, props: { type: body.type } });
    console.log(`[Platform] ${req.user!.battletag} applied ${body.type} on guild ${params.id}.`);
    res.json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
});

router.put('/guilds/:id/note', validate(guildNoteSchema), async (req, res, next) => {
  try {
    const { params, body } = parsed(guildNoteSchema, req);
    const note = await saveGuildNote(params.id, req.user!.id, body.note, body.is_partner);
    await audit(req, 'note_updated', { guildId: params.id, details: { is_partner: body.is_partner } });
    res.json(note);
  } catch (error) {
    next(error);
  }
});

router.get('/audit', validate(auditSchema), async (req, res, next) => {
  try {
    const { page, pageSize } = parsed(auditSchema, req).query;
    res.json(await listAudit(page, pageSize));
  } catch (error) {
    next(error);
  }
});

export default router;
