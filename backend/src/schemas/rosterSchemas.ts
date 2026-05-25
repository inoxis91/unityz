import { z } from 'zod';

export const createRosterSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(255),
    description: z.string().optional().nullable(),
  }),
});

export const updateRosterSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional().nullable(),
  }),
});

export const assignCharacterSchema = z.object({
  params: z.object({
    characterId: z.string().uuid(),
  }),
  body: z.object({
    rosterId: z.string().uuid().nullable(),
  }),
});
