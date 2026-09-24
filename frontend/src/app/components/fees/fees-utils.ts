import { FeeAllocation } from '../../services/fee';

export type MonthState = 'none' | 'partial' | 'paid' | 'donation';

export interface MonthCell {
  index: number;
  /** YYYY-MM */
  key: string;
  amount: number;
  state: MonthState;
  /** Progression vers le minimum, bornée à 100. */
  progress: number;
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function monthState(amount: number, minimum: number): MonthState {
  if (amount <= 0) return 'none';
  if (amount > minimum) return 'donation';
  if (amount === minimum) return 'paid';
  return 'partial';
}

/** Les 12 mois de l'année avec le total validé et l'état par rapport au minimum. */
export function buildYear(
  allocations: FeeAllocation[],
  year: number,
  minimum: number,
): MonthCell[] {
  const byMonth = new Map<string, number>();
  for (const a of allocations) {
    const key = a.month_date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(a.amount || 0));
  }
  return Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year, index);
    const amount = byMonth.get(key) ?? 0;
    return {
      index,
      key,
      amount,
      state: monthState(amount, minimum),
      progress: minimum > 0 ? Math.min(100, Math.round((amount / minimum) * 100)) : 100,
    };
  });
}

/** Mois (YYYY-MM) couverts par une déclaration commençant à `startMonth` (YYYY-MM-DD). */
export function coveredMonths(startMonth: string, duration: number): string[] {
  if (!startMonth) return [];
  const [y, m] = startMonth.split('-').map(Number);
  return Array.from({ length: Math.max(0, duration) }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return monthKey(d.getFullYear(), d.getMonth());
  });
}

/** Montant crédité par mois : le serveur répartit le total à parts égales (arrondi inférieur). */
export function monthlyShare(amount: number, duration: number): number {
  return duration > 0 ? Math.floor((amount || 0) / duration) : 0;
}
