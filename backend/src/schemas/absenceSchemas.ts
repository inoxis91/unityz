import { z } from 'zod';

export const declareAbsenceSchema = z.object({
  body: z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Le format de date doit être YYYY-MM-DD'),
    end_date: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Le format de date doit être YYYY-MM-DD')
      .or(z.literal(''))
      .optional()
      .nullable(),
    reason: z.string().max(1000).optional().nullable(),
  }),
});

export const deleteAbsenceSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID invalide'),
  }),
});
