import express from 'express';
import pool from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { requireActiveGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { clientEventSchema, feedbackSchema } from '../schemas/analyticsSchemas';
import { track, trackOnce } from '../services/analytics';

/**
 * Signaux émis par le navigateur (page d'offres, retour de Stripe sans paiement, questionnaire).
 * Tout le contexte (guilde, droit de payer) est déduit de la session, jamais du client.
 */
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

/** GM ou officier (rang ≤ 2) : seul autorisé à choisir une offre pour la guilde. */
const canManageSubscription = (rank: number | null | undefined) => rank !== null && rank !== undefined && rank <= 2;

// POST /api/analytics/events : page d'offres vue, Checkout abandonné
router.post('/events', limiter, requireActiveGuild, validate(clientEventSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    const { name, tier } = req.body;
    const props =
      name === 'payment_viewed'
        ? { can_manage: canManageSubscription(user.rank) }
        : { tier: tier ?? null };
    await trackOnce(name, { userId: user.id, guildId: user.active_guild_id, props }, name === 'payment_viewed' ? 30 : 5);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// POST /api/analytics/feedback : raison de ne pas souscrire (page d'offres, fin d'essai)
router.post('/feedback', limiter, requireActiveGuild, validate(feedbackSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    const { source, reason, comment } = req.body;
    // Une réponse par utilisateur, guilde et source sur 24 h : la dernière remplace la précédente
    const { rowCount } = await pool.query(
      `UPDATE churn_feedback SET reason = $4, comment = $5, created_at = NOW()
       WHERE id = (
         SELECT id FROM churn_feedback
         WHERE user_id = $1 AND guild_id = $2 AND source = $3 AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 1
       )`,
      [user.id, user.active_guild_id, source, reason, comment],
    );
    if (!rowCount) {
      await pool.query(
        'INSERT INTO churn_feedback (guild_id, user_id, source, reason, comment) VALUES ($1, $2, $3, $4, $5)',
        [user.active_guild_id, user.id, source, reason, comment],
      );
      track('feedback_submitted', { userId: user.id, guildId: user.active_guild_id, props: { source, reason } });
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
