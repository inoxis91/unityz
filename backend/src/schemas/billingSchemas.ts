import { z } from 'zod';

const paidTier = z.enum(['medium', 'pro']);

export const paidTierBodySchema = z.object({
  body: z.object({ tier: paidTier }),
});

export const checkoutSessionSchema = z.object({
  params: z.object({ sessionId: z.string().min(1).max(255) }),
  query: z.object({ tier: paidTier.optional() }).passthrough(),
});
