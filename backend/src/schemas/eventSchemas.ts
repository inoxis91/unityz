import { z } from 'zod';

/** Limites des groupes Mythique+ (miroir de `MPLUS_*` côté frontend). */
export const MPLUS_MAX_GROUPS = 20;
export const MPLUS_GROUP_SIZE = 5;

export const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional().nullable(),
    start_time: z.string().min(10),
    end_time: z.string().min(10),
    type: z.string().min(1),
    roster_id: z.string().uuid().optional().nullable(),
    mm_groups_count: z.number().int().min(0).max(MPLUS_MAX_GROUPS).optional(),
    invited_groups: z.array(z.string()).optional().nullable(),
    logs: z.string().optional().nullable(),
  }),
});

export const updateEventSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional().nullable(),
    start_time: z.string().min(10),
    end_time: z.string().min(10),
    type: z.string().min(1),
    roster_id: z.string().uuid().optional().nullable(),
    mm_groups_count: z.number().int().min(0).max(MPLUS_MAX_GROUPS).optional(),
    invited_groups: z.array(z.string()).optional().nullable(),
    logs: z.string().optional().nullable(),
  }),
});

const groupIndex = z.number().int().min(0).max(MPLUS_MAX_GROUPS); // 0 = sans groupe

export const mplusGroupsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deleteMplusGroupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    index: z.coerce.number().int().min(1).max(MPLUS_MAX_GROUPS),
  }),
});

export const updateSignupGroupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    userId: z.string().min(1),
  }),
  body: z.object({
    group_index: groupIndex,
  }),
});

export const setGroupAssignmentsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    assignments: z
      .array(z.object({ user_id: z.string().min(1), group_index: groupIndex }))
      .min(1)
      .max(200),
  }),
});

export const signupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    character_id: z.preprocess(val => val === '' ? null : val, z.string().uuid().nullable().optional()),
    role: z.enum(['tank', 'heal', 'dps']),
    comment: z.string().max(1000).optional().nullable(),
    status: z.enum(['signed_up', 'standby', 'absent']).optional(),
  }),
});

export const updateSignupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    userId: z.string(),
  }),
  body: z.object({
    character_id: z.preprocess(val => val === '' ? null : val, z.string().uuid().nullable().optional()),
    role: z.enum(['tank', 'heal', 'dps']).optional(),
    status: z.enum(['signed_up', 'standby', 'absent']).optional(),
  }),
});

const raidRole = z.enum(['tank', 'heal', 'dps']);
const lineupSelection = z.enum(['selected', 'benched']).nullable(); // null = remettre en attente

export const updateLineupEntrySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    userId: z.string().min(1),
  }),
  body: z
    .object({
      selection: lineupSelection.optional(),
      assigned_role: raidRole.nullable().optional(), // null = revenir au rôle choisi par le joueur
    })
    .refine((b) => b.selection !== undefined || b.assigned_role !== undefined, {
      message: 'At least one of selection or assigned_role is required',
    }),
});

export const bulkUpdateLineupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    user_ids: z.array(z.string().min(1)).min(1).max(200),
    selection: lineupSelection,
  }),
});

export const eventLogsAnalysisSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    locale: z.enum(['fr', 'en']).default('fr'),
  }),
});
