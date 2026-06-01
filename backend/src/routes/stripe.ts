import express from 'express';
import { requireActiveGuild } from '../middlewares/auth';
import pool from '../lib/db';

const router = express.Router();

// POST /api/stripe/create-checkout-session : Simule la création d'une session Stripe
router.post('/create-checkout-session', requireActiveGuild, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;

    // Security check: Only GMs and Officers (rank <= 2) can manage or activate subscriptions!
    const userRes = await pool.query('SELECT rank FROM users WHERE id = $1', [req.user!.id]);
    const userRank = userRes.rows[0]?.rank;
    
    if (userRank === null || userRank === undefined || userRank > 2) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only Guild Masters and Officers are authorized to manage or activate subscriptions.'
      });
    }

    // Générer un ID de session mock
    const mockSessionId = `mock_cs_${Math.random().toString(36).substring(2, 15)}`;

    // Normalement, ici on ferait appel à stripe.checkout.sessions.create
    // Pour notre mock, on va simplement renvoyer l'URL de redirection mockée
    const checkoutUrl = `/payment?session_id=${mockSessionId}&guild_id=${guildId}`;

    res.json({ url: checkoutUrl });
  } catch (error) {
    next(error);
  }
});

// POST /api/stripe/mock-payment-success : Simule la confirmation de paiement par webhook
router.post('/mock-payment-success', requireActiveGuild, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;
    const { tier } = req.body;

    if (!guildId) {
      return res.status(400).json({ status: 'error', message: 'No active guild found in session.' });
    }

    // Security check: Only GMs and Officers (rank <= 2) can manage or activate subscriptions!
    const userRes = await pool.query('SELECT rank FROM users WHERE id = $1', [req.user!.id]);
    const userRank = userRes.rows[0]?.rank;
    
    if (userRank === null || userRank === undefined || userRank > 2) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only Guild Masters and Officers are authorized to manage or activate subscriptions.'
      });
    }

    const subscriptionTier = tier === 'pro' ? 'pro' : (tier === 'free' ? 'free' : 'medium');
    const interval = subscriptionTier === 'free' ? '30 days' : '1 year';

    // Mettre à jour la guilde au niveau d'abonnement sélectionné et ajouter la durée correspondante
    const result = await pool.query(
      `UPDATE guilds 
       SET subscription_tier = $1, 
           subscription_expires_at = CURRENT_TIMESTAMP + $2::interval, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [subscriptionTier, interval, guildId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Guild not found.' });
    }

    res.json({
      status: 'success',
      message: `Payment completed successfully for ${subscriptionTier} tier (Mocked)`,
      guild: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export default router;
