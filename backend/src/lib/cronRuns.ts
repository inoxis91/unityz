export interface CronRun {
  job: string;
  last_run_at: string | null;
  last_status: 'ok' | 'error' | null;
  last_error: string | null;
  runs: number;
}

// Dernière exécution de chaque tâche planifiée (écran Santé du back-office), en mémoire : une seule instance
const runs = new Map<string, CronRun>();

export const cronRuns = (): CronRun[] => [...runs.values()];

export function registerCronJob(job: string): CronRun {
  const run: CronRun = { job, last_run_at: null, last_status: null, last_error: null, runs: 0 };
  runs.set(job, run);
  return run;
}
