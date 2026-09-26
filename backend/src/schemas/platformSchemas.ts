import { z } from 'zod';
import { FUNNEL_STAGES, GUILD_STATES } from '../services/platformGuildService';

const periodDays = z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d), 'Invalid period');
const region = z.enum(['eu', 'us']);

export const overviewSchema = z.object({
  query: z.object({ days: periodDays.default(30) }),
});

export const funnelSchema = z.object({
  query: z.object({
    // "all" : toutes les guildes depuis le lancement
    days: z.union([z.literal('all'), periodDays]).default(90),
    region: region.optional(),
  }),
});

export const reasonsSchema = z.object({
  query: z.object({ days: periodDays.default(90) }),
});

const guildFilters = {
  search: z.string().trim().max(100).optional(),
  state: z.enum(GUILD_STATES).optional(),
  stage: z.coerce.number().int().min(0).max(FUNNEL_STAGES.length - 1).optional(),
  region: region.optional(),
  partner: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['created', 'name', 'activity', 'members', 'revenue']).default('created'),
};

export const guildListSchema = z.object({
  query: z.object({
    ...guildFilters,
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  }),
});

export const guildExportSchema = z.object({ query: z.object(guildFilters) });

export const guildIdSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

const actionNote = z.string().trim().min(3).max(300);

export const guildActionSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('extend_access'),
      days: z.number().int().min(1).max(365),
      tier: z.enum(['free', 'medium', 'pro']),
      note: actionNote,
    }),
    z.object({ type: z.literal('reset_trial'), note: actionNote }),
    z.object({ type: z.literal('revoke_access'), note: actionNote }),
  ]),
});

export const guildNoteSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    note: z.string().trim().max(2000),
    is_partner: z.boolean(),
  }),
});

export const auditSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(30),
  }),
});
