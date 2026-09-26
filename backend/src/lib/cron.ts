import cron from 'node-cron';
import { EventService } from '../services/eventService';
import { FeeService } from '../services/feeService';
import { notifyEndedTrials, sendPlatformDigest } from '../services/platformNotifier';
import { registerCronJob } from './cronRuns';
import { REGION_TIME_ZONE, WOW_REGIONS } from './regions';

/** Planifie une tâche et garde la trace de sa dernière exécution. */
function schedule(job: string, expression: string, timezone: string, task: () => Promise<void>) {
  const run = registerCronJob(job);
  cron.schedule(
    expression,
    async () => {
      run.runs++;
      run.last_run_at = new Date().toISOString();
      try {
        await task();
        run.last_status = 'ok';
        run.last_error = null;
      } catch (error) {
        run.last_status = 'error';
        run.last_error = (error as Error).message;
        console.error(`[Cron] ${job} failed:`, error);
      }
    },
    { timezone },
  );
}

export const initCronJobs = () => {
  // Every day at 10:00 AM, guild local time - Daily Event Reminder (one run per region)
  for (const region of WOW_REGIONS) {
    schedule(`event_reminders_${region}`, '0 10 * * *', REGION_TIME_ZONE[region], async () => {
      console.log(`[Cron] Checking for today's events (${region})...`);
      await EventService.sendDailyReminders(new Date(), region);
    });
  }

  // Every day at 18:00
  schedule('fee_reminders', '0 18 * * *', 'Europe/Paris', async () => {
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Last 5 days logic
    const totalDaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isEndMonth = dayOfMonth > totalDaysInMonth - 5;

    if (dayOfMonth === 15 || isEndMonth) {
      console.log('[Cron] Checking for unpaid membership fees...');
      await FeeService.sendPaymentReminders();
    }
  });

  // Back-office : digest du créateur à 9:00, relance des essais terminés à 11:00
  schedule('platform_digest', '0 9 * * *', 'Europe/Paris', sendPlatformDigest);
  schedule('trial_end_notifications', '0 11 * * *', 'Europe/Paris', notifyEndedTrials);
};
