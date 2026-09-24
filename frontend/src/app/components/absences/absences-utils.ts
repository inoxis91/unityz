export interface Absence {
  id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  created_at?: string;
}

export type AbsenceState = 'current' | 'upcoming' | 'past';

const day = (dateStr: string) => dateStr.slice(0, 10);

/** État d'une absence par rapport à aujourd'hui (dates YYYY-MM-DD comparées en texte). */
export function absenceState(
  abs: Pick<Absence, 'start_date' | 'end_date'>,
  today: string,
): AbsenceState {
  if (day(abs.start_date) > today) return 'upcoming';
  if (abs.end_date && day(abs.end_date) < today) return 'past';
  return 'current';
}

/** Durée en jours, bornes incluses ; null pour une absence sans fin. */
export function absenceDays(abs: Pick<Absence, 'start_date' | 'end_date'>): number | null {
  if (!abs.end_date) return null;
  const [sy, sm, sd] = day(abs.start_date).split('-').map(Number);
  const [ey, em, ed] = day(abs.end_date).split('-').map(Number);
  const ms = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** En cours d'abord, puis à venir (les plus proches en premier), puis passées (récentes d'abord). */
export function sortAbsences<T extends Absence>(list: T[], today: string): T[] {
  const rank: Record<AbsenceState, number> = { current: 0, upcoming: 1, past: 2 };
  return [...list].sort((a, b) => {
    const sa = absenceState(a, today);
    const sb = absenceState(b, today);
    if (sa !== sb) return rank[sa] - rank[sb];
    const cmp = day(a.start_date).localeCompare(day(b.start_date));
    return sa === 'past' ? -cmp : cmp;
  });
}
