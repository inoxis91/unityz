import cron from 'node-cron';
import { EventService } from '../services/eventService';
import { FeeService } from '../services/feeService';

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
      try {
        await FeeService.sendPaymentReminders();
      } catch (error) {
        console.error('[Cron] Error sending payment reminders:', error);
      }
    }
  }, {
    timezone: "Europe/Paris"
  });
};
