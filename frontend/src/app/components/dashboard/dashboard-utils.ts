import { CalendarEvent } from '../../services/calendar';
import { FeeAllocation } from '../../services/fee';

export type FeeMonthState = 'none' | 'partial' | 'paid' | 'donation';

export interface FeeMonth {
  /** Clé YYYY-MM (heure locale). */
  key: string;
  name: string;
  state: FeeMonthState;
  amount: number;
  /** Progression vers le minimum, bornée à 100. */
  progress: number;
}

/** Statut des cotisations sur `count` mois à partir du mois de `now`. */
export function buildFeeSummary(
  allocations: FeeAllocation[],
  minimum: number,
  now: Date,
  locale: string,
  count = 3,
): FeeMonth[] {
  const months: FeeMonth[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    // YYYY-MM construit en heure locale pour éviter les décalages de fuseau
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const amount = allocations
      .filter((a) => a.month_date.startsWith(key))
      .reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const monthName = d.toLocaleDateString(locale, { month: 'long' });

    let state: FeeMonthState = 'none';
    if (amount > 0) {
      if (amount > minimum) state = 'donation';
      else if (amount === minimum) state = 'paid';
      else state = 'partial';
    }

    months.push({
      key,
      name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
      state,
      amount,
      progress: minimum > 0 ? Math.min(100, Math.round((amount / minimum) * 100)) : 100,
    });
  }
  return months;
}

export interface Countdown {
  /** Texte court (« 2j 4h », « 3h 12m », « 8 min ») ou null si l'événement a commencé. */
  label: string | null;
  /** Moins de 24 h avant le début. */
  soon: boolean;
}

export function formatCountdown(startTime: string, now: Date, dayUnit: string): Countdown {
  const diff = new Date(startTime).getTime() - now.getTime();
  if (diff <= 0) return { label: null, soon: true };

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  if (days > 0) return { label: `${days}${dayUnit} ${hours}h`, soon: false };
  if (hours > 0) return { label: `${hours}h ${minutes}m`, soon: true };
  return { label: `${minutes} min`, soon: true };
}

/** Les `limit` prochains événements non annulés, du plus proche au plus lointain. */
export function pickUpcomingEvents(events: CalendarEvent[], now: Date, limit = 4): CalendarEvent[] {
  const nowMs = now.getTime();
  return events
    .filter((e) => !e.is_canceled && new Date(e.start_time).getTime() > nowMs)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, limit);
}

interface MediaAsset {
  key: string;
  value: string;
}

/** Rendu le plus adapté à une grande carte parmi les médias Blizzard du personnage. */
export function pickCharacterImage(
  details: { media?: { assets?: MediaAsset[] } } | null,
): string | null {
  const assets = details?.media?.assets;
  if (!assets?.length) return null;
  for (const key of ['main-raw', 'main', 'inset', 'portrait', 'avatar']) {
    const asset = assets.find((a) => a.key === key);
    if (asset) return asset.value;
  }
  return assets[0].value;
}
