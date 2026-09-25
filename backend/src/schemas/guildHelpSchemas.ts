import { z } from 'zod';

export const HELP_KINDS = ['request', 'offer'] as const;
export const HELP_CATEGORIES = ['mplus', 'raid', 'class', 'gear', 'professions', 'gold', 'other'] as const;
export const HELP_ROLES = ['tank', 'heal', 'dps'] as const;

export type HelpKind = (typeof HELP_KINDS)[number];
export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export type HelpRole = (typeof HELP_ROLES)[number];

const idParams = z.object({ id: z.string().uuid() });

const postFields = {
  category: z.enum(HELP_CATEGORIES),
  targetRole: z.enum(HELP_ROLES).nullable(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000),
  capacity: z.number().int().min(1).max(10),
};

export const createHelpPostSchema = z.object({
  body: z.object({
    kind: z.enum(HELP_KINDS),
    characterId: z.string().uuid().nullable(),
    ...postFields,
  }),
});

export const updateHelpPostSchema = z.object({
  params: idParams,
  body: z.object({
    characterId: z.string().uuid().nullable(),
    ...postFields,
  }),
});

export const helpIdSchema = z.object({ params: idParams });

export const applyHelpPostSchema = z.object({
  params: idParams,
  body: z.object({
    characterId: z.string().uuid().nullable(),
    message: z.string().trim().max(300),
  }),
});

export const decideHelpApplicationSchema = z.object({
  params: idParams,
  body: z.object({ decision: z.enum(['accept', 'decline']) }),
});

export type CreateHelpPostInput = z.infer<typeof createHelpPostSchema>['body'];
export type UpdateHelpPostInput = z.infer<typeof updateHelpPostSchema>['body'];
export type ApplyHelpPostInput = z.infer<typeof applyHelpPostSchema>['body'];
