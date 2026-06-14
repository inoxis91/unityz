import express from 'express';
import { requireActiveGuild, isAdmin } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { z } from 'zod';
import pool from '../lib/db';

const router = express.Router();

const updateGuildSettingsSchema = z.object({
  body: z.object({
    discordEnabled: z.boolean(),
    discordGuildId: z.string().max(255).nullable(),
    discordEventsChannelId: z.string().max(255).nullable(),
    discordFeesChannelId: z.string().max(255).nullable(),
    discordReminderChannelId: z.string().max(255).nullable(),
    discordOfficerChannelId: z.string().max(255).nullable().optional(),
    feesEnabled: z.boolean().optional(),
    minimumFeeAmount: z.number().int().min(0).optional(),
  }),
});

// GET /api/guilds/my-settings : Récupère les paramètres de la guilde active (Admin uniquement)
router.get('/my-settings', requireActiveGuild, isAdmin, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;

    const result = await pool.query(
      'SELECT id, name, realm, region, subscription_tier, subscription_expires_at, discord_enabled, discord_guild_id, discord_events_channel_id, discord_fees_channel_id, discord_reminder_channel_id, discord_officer_channel_id, fees_enabled, minimum_fee_amount FROM guilds WHERE id = $1',
      [guildId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Guild not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/guilds/my-settings : Met à jour les paramètres de la guilde active (Admin uniquement)
router.put('/my-settings', requireActiveGuild, isAdmin, validate(updateGuildSettingsSchema), async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id;

    const {
      discordEnabled,
      discordGuildId,
      discordEventsChannelId,
      discordFeesChannelId,
      discordReminderChannelId,
      discordOfficerChannelId,
      feesEnabled,
      minimumFeeAmount,
    } = req.body;

    // Check subscription tier (Discord integration is a Pro-only feature)
    const guildRes = await pool.query('SELECT subscription_tier, discord_enabled, discord_guild_id, discord_events_channel_id, discord_fees_channel_id, discord_reminder_channel_id, discord_officer_channel_id FROM guilds WHERE id = $1', [guildId]);
    const guild = guildRes.rows[0];
    const tier = guild?.subscription_tier || 'free';

    const hasDiscordChanges = guild && (
      discordEnabled !== guild.discord_enabled ||
      discordGuildId !== guild.discord_guild_id ||
      discordEventsChannelId !== guild.discord_events_channel_id ||
      discordFeesChannelId !== guild.discord_fees_channel_id ||
      discordReminderChannelId !== guild.discord_reminder_channel_id ||
      discordOfficerChannelId !== guild.discord_officer_channel_id
    );

    if (hasDiscordChanges && tier !== 'pro') {
      return res.status(403).json({
        status: 'error',
        code: 'PRO_FEATURE_REQUIRED',
        message: 'Discord integration is a Pro feature. Please upgrade your subscription.'
      });
    }

    const result = await pool.query(
      `UPDATE guilds 
       SET discord_enabled = $1, 
           discord_guild_id = $2, 
           discord_events_channel_id = $3, 
           discord_fees_channel_id = $4, 
           discord_reminder_channel_id = $5,
           discord_officer_channel_id = $6,
           fees_enabled = $7,
           minimum_fee_amount = $8,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $9 
       RETURNING *`,
      [
        tier === 'pro' ? discordEnabled : false,
        tier === 'pro' ? discordGuildId : null,
        tier === 'pro' ? discordEventsChannelId : null,
        tier === 'pro' ? discordFeesChannelId : null,
        tier === 'pro' ? discordReminderChannelId : null,
        tier === 'pro' ? discordOfficerChannelId : null,
        feesEnabled !== undefined ? feesEnabled : true,
        minimumFeeAmount !== undefined ? minimumFeeAmount : 2000,
        guildId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Guild not found.' });
    }

    res.json({
      status: 'success',
      message: 'Guild settings updated successfully',
      guild: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
