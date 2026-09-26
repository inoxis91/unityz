import { z } from 'zod';
import { CLIENT_EVENTS } from '../services/analytics';

/** Raisons proposées dans les questionnaires (page d'offres, fin d'essai, résiliation). */
export const FEEDBACK_REASONS = [
  'too_expensive',
  'testing_first',
  'not_decision_maker',
  'missing_feature',
  'guild_inactive',
  'other_tool',
  'technical_issue',
  'other',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

const comment = z.string().trim().max(500).default('');

export const clientEventSchema = z.object({
  body: z.object({
    name: z.enum(CLIENT_EVENTS),
    tier: z.enum(['medium', 'pro']).optional(),
  }),
});

export const feedbackSchema = z.object({
  body: z.object({
    source: z.enum(['payment_exit', 'trial_end']),
    reason: z.enum(FEEDBACK_REASONS),
    comment,
  }),
});

export const cancelSubscriptionSchema = z.object({
  body: z.object({
    reason: z.enum(FEEDBACK_REASONS),
    comment,
  }),
});
