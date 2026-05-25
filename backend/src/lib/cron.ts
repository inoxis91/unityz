import cron from 'node-cron';
import pool from './db';
import { sendDiscordChannelMessage } from './discord';

export const initCronJobs = () => {
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
    const channelId = process.env.DISCORD_REMINDER_CHANNEL_ID;
    if (!channelId) return;

    const currentMonth = new Date();
    currentMonth.setDate(1);
    const monthStr = currentMonth.toISOString().split('T')[0];

    // Find users with allocations < 2000 for the current month
    const query = `
      SELECT u.discord_id, u.battletag
      FROM users u
      LEFT JOIN fee_allocations fa ON u.id = fa.user_id AND fa.month_date = $1
      WHERE u.discord_id IS NOT NULL
      AND (fa.amount IS NULL OR fa.amount < 2000)
    `;
    const result = await pool.query(query, [monthStr]);
    const lateUsers = result.rows;

    if (lateUsers.length > 0) {
      const mentions = lateUsers.map(u => `<@${u.discord_id}>`).join(', ');
      const message = `**Rappel de Cotisation** ⏰\nLes membres suivants ne sont pas encore à jour pour ce mois : ${mentions}.\n\nVeuillez déclarer votre dépôt sur le site !`;
      await sendDiscordChannelMessage(channelId, message);
    }
  } catch (error) {
    console.error('[Cron] Error sending payment reminders:', error);
  }
}
