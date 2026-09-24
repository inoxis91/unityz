export type ParseColor = 'pink' | 'orange' | 'purple' | 'blue' | 'green' | 'gray' | 'gold';

/** Palier de couleur Warcraft Logs d'un percentile (100 = or, comme sur WCL). */
export function parseColorClass(percentile: number | null | undefined): ParseColor {
  if (percentile === undefined || percentile === null) return 'gray';
  if (percentile >= 100) return 'gold';
  if (percentile >= 99) return 'pink';
  if (percentile >= 95) return 'orange';
  if (percentile >= 75) return 'purple';
  if (percentile >= 50) return 'blue';
  if (percentile >= 25) return 'green';
  return 'gray';
}

/** Percentile affiché comme sur WCL : tronqué, jamais arrondi au palier supérieur (99.6 → 99). */
export function displayPercent(percentile: number | null | undefined): number | null {
  return percentile === null || percentile === undefined ? null : Math.floor(percentile);
}

/** Durée en `m:ss` (ou `h:mm:ss` au-delà d'une heure). */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Nombre compact localisé (280 588 → « 280,6 k » en fr, « 280.6K » en en). */
export function formatCompact(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/** « Top x % » d'un classement (rang 1 sur 1000 → 0,1 %). */
export function topPercent(rank: number, total: number): number | null {
  if (!rank || !total) return null;
  return Math.max(0.01, (rank / total) * 100);
}
