/**
 * Régions Blizzard prises en charge. Un compte Battle.net peut avoir des personnages
 * dans plusieurs régions : une guilde est identifiée par (region, blizzard_id), car les
 * identifiants de guilde et les slugs de royaume ("illidan") se répètent d'une région à l'autre.
 */
export const WOW_REGIONS = ['eu', 'us'] as const;
export type WowRegion = (typeof WOW_REGIONS)[number];

export const DEFAULT_REGION: WowRegion = 'eu';

export const isWowRegion = (value: unknown): value is WowRegion =>
  WOW_REGIONS.includes(value as WowRegion);

export const toWowRegion = (value: unknown): WowRegion =>
  isWowRegion(value) ? value : DEFAULT_REGION;

/**
 * Fuseau de référence d'une région. Les événements sont stockés en heure murale de la guilde
 * (TIMESTAMP sans fuseau) : c'est ce fuseau qui sert à savoir si un événement est passé
 * et à quelle heure locale partent les rappels quotidiens.
 */
export const REGION_TIME_ZONE: Record<WowRegion, string> = {
  eu: 'Europe/Paris',
  us: 'America/New_York',
};

/** Expression SQL du fuseau d'une guilde à partir de sa colonne `region`. */
export const sqlRegionTimeZone = (regionColumn: string) =>
  `CASE ${regionColumn} WHEN 'us' THEN '${REGION_TIME_ZONE.us}' ELSE '${REGION_TIME_ZONE.eu}' END`;

// Guilde découverte sur Battle.net mais pas encore enregistrée : UUID "virtuel" dont le
// 4e groupe encode la région (0000 = EU, rétrocompatible avec les anciens identifiants).
const VIRTUAL_REGION_CODE: Record<WowRegion, string> = { eu: '0000', us: '0001' };
const VIRTUAL_GUILD_ID = /^00000000-0000-0000-(\d{4})-(\d{12})$/;

export const toVirtualGuildId = (region: WowRegion, blizzardId: number): string =>
  `00000000-0000-0000-${VIRTUAL_REGION_CODE[region]}-${String(blizzardId).padStart(12, '0')}`;

export function parseVirtualGuildId(id: string): { region: WowRegion; blizzardId: number } | null {
  const match = VIRTUAL_GUILD_ID.exec(id);
  if (!match) return null;
  const region = WOW_REGIONS.find((r) => VIRTUAL_REGION_CODE[r] === match[1]);
  return region ? { region, blizzardId: parseInt(match[2], 10) } : null;
}
