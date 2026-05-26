import { z } from 'zod';

export const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional().nullable(),
    start_time: z.string().min(10),
    end_time: z.string().min(10),
    type: z.string().min(1),
    roster_id: z.string().uuid().optional().nullable(),
    mm_groups_count: z.number().int().min(0).optional(),
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
    mm_groups_count: z.number().int().min(0).optional(),
  }),
});

export const updateSignupGroupSchema = z.object({
  params: z.object({
    id: z.string().uuid(), // eventId
    userId: z.string(),
  }),
  body: z.object({
    group_index: z.number().int().min(0),
  }),
});

export const updateGroupsCountSchema = z.object({
  params: z.object({
    id: z.string().uuid(), // eventId
  }),
  body: z.object({
    count: z.number().int().min(0),
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
