import { z } from 'zod';

export const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional().nullable(),
    start_time: z.string().min(10),
    end_time: z.string().min(10),
    type: z.string().min(1),
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
  }),
});

export const signupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    character_id: z.string().uuid().nullable().optional(),
    role: z.enum(['tank', 'heal', 'dps']),
    comment: z.string().max(1000).optional().nullable(),
    status: z.enum(['signed_up', 'standby', 'absent']).optional(),
  }),
});
