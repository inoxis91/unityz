import type { FunnelStep, GuildState, TimelineItem } from '../../services/backoffice';

/** Ordre d'affichage des états commerciaux d'une guilde (du plus précieux au moins avancé). */
export const GUILD_STATES: readonly GuildState[] = [
  'paying',
  'canceling',
  'past_due',
  'comped',
  'trial',
  'lapsed',
  'prospect',
];

/** Teinte d'un état : badge (`ui-badge`) et segment de la barre de répartition. */
export const STATE_TONE: Record<
  GuildState,
  'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral'
> = {
  paying: 'success',
  canceling: 'warning',
  past_due: 'danger',
  comped: 'purple',
  trial: 'info',
  lapsed: 'neutral',
  prospect: 'neutral',
};

export const FUNNEL_STAGES = [
  'created',
  'manager_joined',
  'payment_viewed',
  'offer_activated',
  'engaged',
  'paid',
  'retained',
] as const;

/** Montant en centimes formaté dans la devise (euros par défaut). */
export function formatCents(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatPercent(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
  }).format(value);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

export interface Delta {
  /** Variation relative (0.25 = +25 %), null si la période précédente était vide. */
  ratio: number | null;
  direction: 'up' | 'down' | 'flat';
}

/** Évolution d'un compteur par rapport à la période précédente. */
export function delta(current: number, previous: number): Delta {
  const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
  return { ratio: previous > 0 ? (current - previous) / previous : null, direction };
}

export interface FunnelRow {
  key: string;
  reached: number;
  stopped: number;
  /** Part du haut du tunnel encore présente à cette étape. */
  ofTotal: number;
  /** Passage depuis l'étape précédente (null pour la première). */
  fromPrevious: number | null;
}

/** Taux de passage d'un tunnel (`stopped` : arrêtés à cette étape, déduits si absents). */
export function funnelRows(steps: FunnelStep[]): FunnelRow[] {
  const top = steps[0]?.reached ?? 0;
  return steps.map((step, i) => {
    const previous = i > 0 ? steps[i - 1].reached : null;
    const next = steps[i + 1];
    return {
      key: step.key,
      reached: step.reached,
      stopped: step.stopped ?? (next ? Math.max(0, step.reached - next.reached) : 0),
      ofTotal: top > 0 ? step.reached / top : 0,
      fromPrevious: previous === null ? null : previous > 0 ? step.reached / previous : 0,
    };
  });
}

/** Étape où le plus de guildes décrochent (hors dernière étape, qui est l'objectif). */
export function biggestDropOff(rows: FunnelRow[]): string | null {
  let worst: FunnelRow | null = null;
  for (const row of rows.slice(0, -1)) {
    if (row.stopped > 0 && (!worst || row.stopped > worst.stopped)) worst = row;
  }
  return worst?.key ?? null;
}

export interface ChartPoint {
  /** Premier jour du groupe (YYYY-MM-DD). */
  day: string;
  /** Dernier jour du groupe (identique à `day` pour un point quotidien). */
  until: string;
  value: number;
}

/**
 * Série quotidienne prête pour un histogramme : regroupée par semaine au-delà de `maxBars` jours
 * (365 barres d'un pixel ne se lisent pas).
 */
export function bucketSeries<T extends { day: string }>(
  series: T[],
  metric: keyof T,
  maxBars = 92,
): ChartPoint[] {
  const points = series.map((p) => ({ day: p.day, until: p.day, value: Number(p[metric]) || 0 }));
  if (points.length <= maxBars) return points;
  const weeks: ChartPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    weeks.push({
      day: chunk[0].day,
      until: chunk[chunk.length - 1].day,
      value: chunk.reduce((sum, p) => sum + p.value, 0),
    });
  }
  return weeks;
}

/** Graduation « ronde » au-dessus du maximum (1, 2, 2.5, 5 × 10ⁿ), pour des repères lisibles. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Jour ISO (YYYY-MM-DD) formaté sans décalage de fuseau. */
export function formatDay(
  day: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(locale, options ?? { day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

/** « il y a 3 h », « dans 5 j »… */
export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86_400_000],
    ['month', 30 * 86_400_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, 'minute');
}

/** Durée compacte (« 42 s », « 12 min », « 5 h », « 3 j ») via les unités localisées d'Intl. */
export function formatDuration(seconds: number, locale: string): string {
  const units: [Intl.NumberFormatOptions['unit'], number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size) {
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: 0,
      }).format(Math.floor(seconds / size));
    }
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'short',
  }).format(Math.max(0, Math.round(seconds)));
}

/** Jour d'activité (YYYY-MM-DD) relatif à aujourd'hui : « aujourd'hui », « hier », « il y a 5 jours ». */
export function relativeDay(day: string, locale: string, now = new Date()): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(diff) >= 60) return rtf.format(Math.round(diff / 30), 'month');
  return rtf.format(diff, 'day');
}

/** Jours d'accès restants (négatif : expiré), null sans échéance. */
export function daysLeft(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
}

/** Intensité (0 à 1) d'une cellule de rétention, pour un fond séquentiel à une seule teinte. */
export function heatLevel(value: number | null): number {
  if (value === null) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface TimelineGroup extends TimelineItem {
  /** Nombre d'occurrences consécutives fusionnées (connexions, sélections répétées…). */
  count: number;
}

/** Fusionne les entrées consécutives identiques sans commentaire (la plus récente est gardée). */
export function groupTimeline(items: TimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    const plain = (i: TimelineItem) => !i.data?.['comment'] && !i.data?.['note'];
    if (
      last &&
      last.kind === item.kind &&
      last.type === item.type &&
      last.battletag === item.battletag &&
      plain(last) &&
      plain(item)
    ) {
      last.count++;
    } else {
      groups.push({ ...item, count: 1 });
    }
  }
  return groups;
}
