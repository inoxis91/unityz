/** Blizzard regions supported by the app (mirrors `backend/src/lib/regions.ts`). */
export type WowRegion = 'eu' | 'us';

export const DEFAULT_REGION: WowRegion = 'eu';

/** Realm slug as used by Raider.io and Warcraft Logs ("Culte de la Rive noire" → "culte-de-la-rive-noire"). */
export function toRealmSlug(realm: string): string {
  return realm.toLowerCase().trim().replace(/\s+/g, '-').replace(/'/g, '');
}

function characterPath(region: WowRegion, realm: string, name: string): string {
  return `${region}/${encodeURIComponent(toRealmSlug(realm))}/${encodeURIComponent(name.toLowerCase())}`;
}

export function warcraftLogsCharacterUrl(
  region: WowRegion,
  name: string | undefined,
  realm: string | undefined,
): string {
  if (!name || !realm) return '#';
  return `https://www.warcraftlogs.com/character/${characterPath(region, realm, name)}`;
}

export function raiderIoCharacterUrl(
  region: WowRegion,
  name: string | undefined,
  realm: string | undefined,
): string {
  if (!name || !realm) return '#';
  return `https://raider.io/characters/${characterPath(region, realm, name)}`;
}
