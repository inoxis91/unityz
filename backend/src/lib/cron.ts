import cron from 'node-cron';
import pool from './db';
import { sendDiscordChannelMessage } from './discord';
import { EventService } from '../services/eventService';

export const initCronJobs = () => {
  // Every day at 10:00 AM - Daily Event Reminder
  cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Checking for today\'s events...');
    await EventService.sendDailyReminders(new Date());
  }, {
    timezone: "Europe/Paris"
  });

  // Every day at 18:00
  cron.schedule('0 18 * * *', async () => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    
    // Last 5 days logic
    const totalDaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isEndMonth = dayOfMonth > totalDaysInMonth - 5;

    if (dayOfMonth === 15 || isEndMonth) {
      console.log('[Cron] Checking for unpaid membership fees...');
      await sendPaymentReminders();
    }
  }, {
    timezone: "Europe/Paris"
  });
};

async function sendPaymentReminders() {
  try {
    // Fetch all Pro guilds with Discord reminders enabled and active subscriptions
    const guildsRes = await pool.query(`
      SELECT id, discord_reminder_channel_id, minimum_fee_amount 
      FROM guilds 
      WHERE subscription_tier = 'pro' 
        AND subscription_expires_at > CURRENT_TIMESTAMP 
        AND discord_enabled = TRUE 
        AND discord_reminder_channel_id IS NOT NULL
    `);
    
    for (const guild of guildsRes.rows) {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const monthStr = currentMonth.toISOString().split('T')[0];

      // Find users with allocations < minimum_fee_amount for the current month in this guild
      const query = `
        SELECT DISTINCT u.discord_id, u.battletag
        FROM users u
        JOIN characters c ON u.id = c.user_id AND c.guild_id = $1
        LEFT JOIN fee_allocations fa ON u.id = fa.user_id AND fa.month_date = $2 AND fa.guild_id = $1
        WHERE u.discord_id IS NOT NULL
        AND (fa.amount IS NULL OR fa.amount < $3)
      `;
      const result = await pool.query(query, [guild.id, monthStr, guild.minimum_fee_amount]);
      const lateUsers = result.rows;

      if (lateUsers.length > 0) {
        const mentions = lateUsers.map(u => `<@${u.discord_id}>`).join(', ');
        const message = `**Rappel de Cotisation** ⏰\nLes membres suivants ne sont pas encore à jour pour ce mois (Minimum requis : ${guild.minimum_fee_amount} PO) : ${mentions}.\n\nVeuillez déclarer votre dépôt sur le site !`;
        await sendDiscordChannelMessage(guild.discord_reminder_channel_id, message);
      }
    }
  } catch (error) {
    console.error('[Cron] Error sending payment reminders:', error);
  }
}
