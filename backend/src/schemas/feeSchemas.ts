import { z } from 'zod';

export const createDeclarationSchema = z.object({
  body: z.object({
    amount: z.number().int().positive('Amount must be positive'),
    start_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    duration_months: z.number().int().min(1).max(24),
    comment: z.string().max(1000).optional().nullable(),
  }),
});

export const resolveDeclarationSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    status: z.enum(['accepted', 'rejected']),
    admin_comment: z.string().max(1000).optional().nullable(),
  }),
});

export const adjustAllocationSchema = z.object({
  body: z.object({
    userId: z.string().uuid().or(z.string().min(1)), // Can be UUID or string Bnet ID
    monthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number().int().min(0),
  }),
});
