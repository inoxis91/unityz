import { HttpError } from '../middlewares/errorHandler';
import { isWclConfigured, wclQuery } from '../lib/wclClient';
import { TtlCache } from '../lib/ttlCache';

/**
 * Performances Warcraft Logs d'un personnage (page personnage WCL) : raid et Mythique+ de la saison en cours.
 * La saison est détectée depuis `worldData` : aucune zone n'est à mettre à jour à chaque patch.
 */

export type WclMetric = 'dps' | 'hps';
export type WclSource = 'wcl' | 'mock';

export interface LocalizedName {
  en: string;
  fr: string;
}

export interface SeasonEncounter {
  id: number;
  name: LocalizedName;
}

export interface SeasonZone {
  id: number;
  name: LocalizedName;
  encounters: SeasonEncounter[];
}

export interface WclSeason {
  raids: SeasonZone[];
  mythicPlus: SeasonZone;
}

/** Classement All Stars d'une spécialisation sur une zone. */
export interface WclSpecRanking {
  spec: string;
  points: number;
  possiblePoints: number | null;
  rank: number;
  regionRank: number;
  serverRank: number;
  rankPercent: number;
  total: number;
}

export interface WclEncounterRanking {
  points: number;
  rank: number;
  regionRank: number;
  serverRank: number;
  rankPercent: number;
  total: number;
}

export interface RaidEncounterPerformance {
  id: number;
  name: LocalizedName;
  iconUrl: string;
  kills: number;
  bestPercent: number | null;
  medianPercent: number | null;
  /** Meilleur DPS/HPS sur un kill classé. */
  bestAmount: number | null;
  fastestKillMs: number | null;
  spec: string | null;
  itemLevel: number | null;
  /** false tant que le boss n'est pas verrouillé (WCL : « Not Locked In »). */
  lockedIn: boolean;
  allStars: WclEncounterRanking | null;
}

export interface ZoneInfo {
  id: number;
  name: LocalizedName;
  imageUrl: string;
}

export interface RaidZonePerformance {
  zone: ZoneInfo;
  /** Difficulté effectivement retenue (la plus haute avec des kills quand aucune n'est demandée). */
  difficulty: number | null;
  bestAverage: number | null;
  medianAverage: number | null;
  killsLogged: number;
  bossesKilled: number;
  bossCount: number;
  allStars: WclSpecRanking[];
  encounters: RaidEncounterPerformance[];
}

export interface RaidPerformance {
  source: WclSource;
  metric: WclMetric;
  spec: string | null;
  zones: RaidZonePerformance[];
}

export interface DungeonPerformance {
  id: number;
  name: LocalizedName;
  iconUrl: string;
  runs: number;
  keyLevel: number | null;
  /** Durée de la meilleure clé (celle qui donne le score). */
  timeMs: number | null;
  points: number | null;
  spec: string | null;
  ranking: WclEncounterRanking | null;
  /** Parse DPS/HPS sur la meilleure clé du donjon, par niveau de clé. */
  throughput: {
    amount: number;
    keyLevel: number;
    bestPercent: number | null;
    medianPercent: number | null;
  } | null;
}

export interface MythicPlusPerformance {
  source: WclSource;
  metric: WclMetric;
  zone: ZoneInfo;
  /** Meilleur score de la saison (toutes spécialisations confondues). */
  score: number | null;
  specs: WclSpecRanking[];
  throughputBestAverage: number | null;
  throughputMedianAverage: number | null;
  runs: number;
  dungeons: DungeonPerformance[];
}

export interface WclCharacterRef {
  name: string;
  realmSlug: string;
  region: string;
  className: string;
}

export interface RaidQuery {
  difficulty?: number;
  metric: WclMetric;
  spec?: string;
}

/** Saison utilisée si `worldData` est injoignable (et pour les données de démonstration). */
const FALLBACK_SEASON: WclSeason = {
  raids: [
    {
      id: 53,
      name: { en: 'The Venomous Abyss', fr: 'The Venomous Abyss' },
      encounters: [
        { id: 3470, name: { en: "Nek'zali the Soulcoiler", fr: 'Nek’zali l’Entortillâme' } },
        { id: 3445, name: { en: 'Entombed Sentinels', fr: 'Sentinelles inhumées' } },
        { id: 3455, name: { en: 'Vashnik the Malignant', fr: 'Vashnik le Malveillant' } },
        { id: 3497, name: { en: 'The Lost Explorers', fr: 'L’expédition perdue' } },
        { id: 3420, name: { en: 'Sszorak', fr: 'Sszorak' } },
        { id: 3421, name: { en: 'The Twin Fangs', fr: 'Les crochets jumeaux' } },
        { id: 3429, name: { en: 'The Coiled Altar', fr: 'Autel Annelé' } },
        { id: 3492, name: { en: "Ula'tek", fr: 'Ula’tek' } },
        { id: 3379, name: { en: 'Nymrissa Wavecaller', fr: 'Nymrissa Mande-vagues' } },
        { id: 3513, name: { en: "Kith'ix", fr: "Kith'ix" } },
      ],
    },
  ],
  mythicPlus: {
    id: 55,
    name: { en: 'Mythic+ Season 2', fr: 'Mythic+ Season 2' },
    encounters: [
      { id: 12993, name: { en: 'Altar of Fangs', fr: 'Altar of Fangs' } },
      { id: 12825, name: { en: 'Den of Nalorakk', fr: 'Den of Nalorakk' } },
      { id: 61762, name: { en: "Kings' Rest", fr: 'Repos des rois' } },
      { id: 12813, name: { en: 'Murder Row', fr: 'Murder Row' } },
      { id: 112521, name: { en: 'Ruby Life Pools', fr: 'Bassin de Vie Rubis' } },
      { id: 61877, name: { en: 'Temple of Sethraliss', fr: 'Temple de Sephraliss' } },
      { id: 12859, name: { en: 'The Blinding Vale', fr: 'The Blinding Vale' } },
      { id: 12923, name: { en: 'Voidscar Arena', fr: 'Voidscar Arena' } },
    ],
  },
};

const SEASON_TTL_MS = 6 * 60 * 60 * 1000;
const SEASON_FALLBACK_TTL_MS = 5 * 60 * 1000;
const PERFORMANCE_TTL_MS = 10 * 60 * 1000;
const M_PLUS_DIFFICULTY = 10;
const MYTHIC_DIFFICULTY = 5;
/** WCL encode la durée d'une clé dans `speed` : durée (ms) = niveau × 40 000 000 + speed. */
const KEY_SPEED_LEVEL_FACTOR = 40_000_000;
const MAX_KEY_DURATION_MS = 3 * 60 * 60 * 1000;

const seasonCache = new TtlCache<WclSeason>(SEASON_TTL_MS, 1);
const raidCache = new TtlCache<RaidPerformance>(PERFORMANCE_TTL_MS);
const mythicPlusCache = new TtlCache<MythicPlusPerformance>(PERFORMANCE_TTL_MS);

/* ------------------------------------------------------------------ */
/* Types bruts de l'API (JSON non typé de zoneRankings)                */
/* ------------------------------------------------------------------ */

interface RawAllStars {
  spec?: string;
  points?: number;
  possiblePoints?: number;
  rank?: number;
  regionRank?: number;
  serverRank?: number;
  rankPercent?: number;
  total?: number;
}

interface RawZoneRanking {
  encounter?: { id: number; name: string };
  rankPercent?: number | null;
  medianPercent?: number | null;
  lockedIn?: boolean;
  totalKills?: number;
  fastestKill?: number;
  allStars?: RawAllStars | null;
  spec?: string | null;
  bestAmount?: number;
  bestRank?: { ilvl?: number; speed?: number; score?: number; per_second_amount?: number };
}

interface RawZoneRankings {
  difficulty?: number;
  allStars?: RawAllStars[];
  rankings?: RawZoneRanking[];
  throughputRankings?: Record<
    string,
    {
      best_per_second_amount?: number;
      best_level?: number;
      best_historical_percentile?: number | null;
      median_historical_percentile?: number | null;
    }
  >;
}

interface RawWorldZone {
  id: number;
  name: string;
  frozen: boolean;
  difficulties: { id: number }[] | null;
  encounters: { id: number; name: string }[] | null;
}

interface RawWorldData {
  worldData: { expansions: { id: number; zones: RawWorldZone[] | null }[] };
}

/* ------------------------------------------------------------------ */
/* Détection de la saison                                              */
/* ------------------------------------------------------------------ */

const SEASON_QUERY = `
  query {
    worldData {
      expansions {
        id
        zones { id name frozen difficulties { id } encounters { id name } }
      }
    }
  }
`;

const isTestZone = (zone: RawWorldZone) => /\b(ptr|beta)\b/i.test(zone.name);
const difficultyIds = (zone: RawWorldZone) => (zone.difficulties ?? []).map((d) => d.id);

function isRaidZone(zone: RawWorldZone): boolean {
  return (
    !isTestZone(zone) &&
    // Les zones « Complete Raid » classent le raid entier comme une seule rencontre.
    !/complete raid/i.test(zone.name) &&
    difficultyIds(zone).includes(MYTHIC_DIFFICULTY) &&
    (zone.encounters?.length ?? 0) > 0
  );
}

function isMythicPlusZone(zone: RawWorldZone): boolean {
  const ids = difficultyIds(zone);
  return (
    !isTestZone(zone) &&
    ids.length === 1 &&
    ids[0] === M_PLUS_DIFFICULTY &&
    (zone.encounters?.length ?? 0) > 0
  );
}

/**
 * Zones de la saison en cours : dans l'extension la plus récente qui en contient, les zones non gelées
 * (plusieurs raids possibles, ex. raid principal + mini-raid), sinon la plus récente.
 */
function pickZones(
  expansions: RawWorldData['worldData']['expansions'],
  predicate: (zone: RawWorldZone) => boolean,
): RawWorldZone[] {
  const sorted = [...expansions].sort((a, b) => b.id - a.id);
  for (const expansion of sorted) {
    const candidates = (expansion.zones ?? []).filter(predicate).sort((a, b) => a.id - b.id);
    if (candidates.length === 0) continue;
    const live = candidates.filter((z) => !z.frozen);
    return live.length > 0 ? live : [candidates[candidates.length - 1]];
  }
  return [];
}

function toSeasonZone(zone: RawWorldZone, frZones: Map<number, RawWorldZone>): SeasonZone {
  const frZone = frZones.get(zone.id);
  const frNames = new Map((frZone?.encounters ?? []).map((e) => [e.id, e.name]));
  return {
    id: zone.id,
    name: { en: zone.name, fr: frZone?.name || zone.name },
    encounters: (zone.encounters ?? []).map((e) => ({
      id: e.id,
      // La traduction WCL est parfois vide pour les boss récents.
      name: { en: e.name, fr: frNames.get(e.id)?.trim() || e.name },
    })),
  };
}

async function loadSeason(): Promise<WclSeason> {
  const [en, fr] = await Promise.all([
    wclQuery<RawWorldData>(SEASON_QUERY),
    wclQuery<RawWorldData>(SEASON_QUERY, {}, { locale: 'fr' }).catch(() => null),
  ]);
  const expansions = en.worldData.expansions;
  const frZones = new Map(
    (fr?.worldData.expansions ?? []).flatMap((e) => e.zones ?? []).map((z) => [z.id, z]),
  );

  const raids = pickZones(expansions, isRaidZone);
  const [mythicPlus] = pickZones(expansions, isMythicPlusZone).slice(-1);
  if (raids.length === 0 || !mythicPlus) {
    throw new Error('No current raid or Mythic+ zone found in worldData');
  }
  return {
    raids: raids.map((z) => toSeasonZone(z, frZones)),
    mythicPlus: toSeasonZone(mythicPlus, frZones),
  };
}

export async function getCurrentSeason(): Promise<WclSeason> {
  if (!isWclConfigured()) return FALLBACK_SEASON;
  try {
    return await seasonCache.getOrLoad('season', loadSeason);
  } catch (err) {
    console.warn(
      '[WCL] Season detection failed, using fallback zones:',
      err instanceof Error ? err.message : err,
    );
    return seasonCache.getOrLoad('season', async () => FALLBACK_SEASON, SEASON_FALLBACK_TTL_MS);
  }
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                        */
/* ------------------------------------------------------------------ */

const WCL_ASSETS = 'https://assets.rpglogs.com/img/warcraft';

/** Les rencontres réutilisées d'une ancienne saison ont un préfixe (61762 → 11762) que WCL ignore pour l'icône. */
const encounterIconUrl = (id: number) =>
  `${WCL_ASSETS}/bosses/${id >= 10_000 ? 10_000 + (id % 10_000) : id}-icon.jpg`;
const zoneImageUrl = (id: number) => `${WCL_ASSETS}/zones/zone-${id}.png`;

const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const roundOrNull = (value: unknown): number | null => {
  const n = numberOrNull(value);
  return n === null ? null : round(n);
};

function average(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? round(valid.reduce((sum, v) => sum + v, 0) / valid.length) : null;
}

function toSpecRanking(raw: RawAllStars): WclSpecRanking {
  return {
    spec: raw.spec ?? 'Unknown',
    points: round(raw.points ?? 0),
    possiblePoints: numberOrNull(raw.possiblePoints),
    rank: raw.rank ?? 0,
    regionRank: raw.regionRank ?? 0,
    serverRank: raw.serverRank ?? 0,
    rankPercent: round(raw.rankPercent ?? 0),
    total: raw.total ?? 0,
  };
}

function toEncounterRanking(raw: RawAllStars | null | undefined): WclEncounterRanking | null {
  if (!raw || !raw.rank) return null;
  return {
    points: round(raw.points ?? 0),
    rank: raw.rank,
    regionRank: raw.regionRank ?? 0,
    serverRank: raw.serverRank ?? 0,
    rankPercent: round(raw.rankPercent ?? 0),
    total: raw.total ?? 0,
  };
}

const sortSpecs = (specs: RawAllStars[] | undefined) =>
  (specs ?? []).map(toSpecRanking).sort((a, b) => b.points - a.points);

function decodeKeyDuration(keyLevel: number | null, speed: number | undefined): number | null {
  if (!keyLevel || typeof speed !== 'number') return null;
  const duration = keyLevel * KEY_SPEED_LEVEL_FACTOR + speed;
  return duration > 0 && duration < MAX_KEY_DURATION_MS ? duration : null;
}

function buildRaidZone(zone: SeasonZone, raw: RawZoneRankings | null): RaidZonePerformance {
  const byId = new Map((raw?.rankings ?? []).map((r) => [r.encounter?.id, r]));
  const encounters = zone.encounters.map((enc): RaidEncounterPerformance => {
    const r = byId.get(enc.id);
    const kills = r?.totalKills ?? 0;
    return {
      id: enc.id,
      name: enc.name,
      iconUrl: encounterIconUrl(enc.id),
      kills,
      bestPercent: roundOrNull(r?.rankPercent),
      medianPercent: roundOrNull(r?.medianPercent),
      bestAmount: r?.bestAmount ? round(r.bestAmount, 1) : null,
      fastestKillMs: kills > 0 && r?.fastestKill && r.fastestKill > 0 ? r.fastestKill : null,
      spec: r?.spec ?? null,
      itemLevel: numberOrNull(r?.bestRank?.ilvl),
      lockedIn: r?.lockedIn ?? true,
      allStars: toEncounterRanking(r?.allStars),
    };
  });

  return {
    zone: { id: zone.id, name: zone.name, imageUrl: zoneImageUrl(zone.id) },
    difficulty: numberOrNull(raw?.difficulty),
    // Mêmes formules que WCL : moyenne des meilleurs / médians % des boss classés.
    bestAverage: average(encounters.map((e) => e.bestPercent)),
    medianAverage: average(encounters.map((e) => e.medianPercent)),
    killsLogged: encounters.reduce((sum, e) => sum + e.kills, 0),
    bossesKilled: encounters.filter((e) => e.kills > 0).length,
    bossCount: encounters.length,
    allStars: sortSpecs(raw?.allStars),
    encounters,
  };
}

function buildMythicPlus(
  zone: SeasonZone,
  raw: RawZoneRankings | null,
  metric: WclMetric,
  source: WclSource,
): MythicPlusPerformance {
  const byId = new Map((raw?.rankings ?? []).map((r) => [r.encounter?.id, r]));
  const throughput = raw?.throughputRankings ?? {};

  const dungeons = zone.encounters.map((enc): DungeonPerformance => {
    const r = byId.get(enc.id);
    const runs = r?.totalKills ?? 0;
    const keyLevel = runs > 0 ? numberOrNull(r?.bestRank?.ilvl) : null;
    const t = throughput[String(enc.id)];
    return {
      id: enc.id,
      name: enc.name,
      iconUrl: encounterIconUrl(enc.id),
      runs,
      keyLevel,
      timeMs: decodeKeyDuration(keyLevel, r?.bestRank?.speed),
      points: runs > 0 && r?.bestAmount ? round(r.bestAmount, 1) : null,
      spec: r?.spec ?? null,
      ranking: toEncounterRanking(r?.allStars),
      throughput: t?.best_per_second_amount
        ? {
            amount: round(t.best_per_second_amount, 1),
            keyLevel: t.best_level ?? 0,
            bestPercent: numberOrNull(t.best_historical_percentile),
            medianPercent: numberOrNull(t.median_historical_percentile),
          }
        : null,
    };
  });

  const specs = sortSpecs(raw?.allStars);
  return {
    source,
    metric,
    zone: { id: zone.id, name: zone.name, imageUrl: zoneImageUrl(zone.id) },
    score: specs.length ? specs[0].points : null,
    specs,
    throughputBestAverage: average(dungeons.map((d) => d.throughput?.bestPercent ?? null)),
    throughputMedianAverage: average(dungeons.map((d) => d.throughput?.medianPercent ?? null)),
    runs: dungeons.reduce((sum, d) => sum + d.runs, 0),
    dungeons,
  };
}

/* ------------------------------------------------------------------ */
/* Requêtes                                                             */
/* ------------------------------------------------------------------ */

interface RawCharacterResponse {
  characterData: {
    character: ({ hidden: boolean } & Record<string, RawZoneRankings | boolean | null>) | null;
  };
}

const zoneAlias = (zoneId: number) => `z${zoneId}`;

async function fetchCharacterZones(
  ref: WclCharacterRef,
  fields: string[],
  variables: Record<string, unknown>,
  variableDefs: string,
): Promise<Record<string, RawZoneRankings | null>> {
  const query = `
    query ($name: String!, $server: String!, $region: String!${variableDefs}) {
      characterData {
        character(name: $name, serverSlug: $server, serverRegion: $region) {
          hidden
          ${fields.join('\n          ')}
        }
      }
    }
  `;
  const data = await wclQuery<RawCharacterResponse>(query, {
    name: ref.name,
    server: ref.realmSlug,
    region: ref.region.toLowerCase(),
    ...variables,
  });

  const character = data.characterData.character;
  if (!character) {
    throw new HttpError(404, 'Character not found on Warcraft Logs', 'WCL_CHARACTER_NOT_FOUND');
  }
  if (character.hidden) {
    throw new HttpError(404, 'Character is hidden on Warcraft Logs', 'WCL_CHARACTER_HIDDEN');
  }
  return character as unknown as Record<string, RawZoneRankings | null>;
}

const cacheKey = (ref: WclCharacterRef, ...parts: unknown[]) =>
  [ref.region.toLowerCase(), ref.realmSlug, ref.name.toLowerCase(), ...parts].join('|');

export class WclCharacterService {
  static async getRaidPerformance(ref: WclCharacterRef, params: RaidQuery): Promise<RaidPerformance> {
    const season = await getCurrentSeason();
    if (!isWclConfigured()) return mockRaid(ref, season, params);

    const key = cacheKey(ref, 'raid', season.raids.map((z) => z.id), params.difficulty, params.metric, params.spec);
    return raidCache.getOrLoad(key, async () => {
      const fields = season.raids.map(
        (z) =>
          `${zoneAlias(z.id)}: zoneRankings(zoneID: ${z.id}, difficulty: $difficulty, metric: $metric, specName: $spec)`,
      );
      const raw = await fetchCharacterZones(
        ref,
        fields,
        { difficulty: params.difficulty ?? null, metric: params.metric, spec: params.spec ?? null },
        ', $difficulty: Int, $metric: CharacterPageRankingMetricType, $spec: String',
      );
      return {
        source: 'wcl',
        metric: params.metric,
        spec: params.spec ?? null,
        zones: season.raids.map((z) => buildRaidZone(z, raw[zoneAlias(z.id)] ?? null)),
      };
    });
  }

  static async getMythicPlusPerformance(
    ref: WclCharacterRef,
    metric: WclMetric,
  ): Promise<MythicPlusPerformance> {
    const season = await getCurrentSeason();
    if (!isWclConfigured()) return mockMythicPlus(ref, season, metric);

    const zone = season.mythicPlus;
    const key = cacheKey(ref, 'mplus', zone.id, metric);
    return mythicPlusCache.getOrLoad(key, async () => {
      // points_and_* renvoie le score par donjon et, dans throughputRankings, le parse DPS/HPS par niveau de clé.
      const wclMetric = metric === 'hps' ? 'points_and_healing' : 'points_and_damage';
      const raw = await fetchCharacterZones(
        ref,
        [`${zoneAlias(zone.id)}: zoneRankings(zoneID: ${zone.id}, metric: ${wclMetric})`],
        {},
        '',
      );
      return buildMythicPlus(zone, raw[zoneAlias(zone.id)] ?? null, metric, 'wcl');
    });
  }
}

/* ------------------------------------------------------------------ */
/* Données de démonstration (WCL non configuré en local)               */
/* ------------------------------------------------------------------ */

const DEMO_SPECS: Record<string, string> = {
  warrior: 'Fury', paladin: 'Retribution', hunter: 'Marksmanship', rogue: 'Outlaw',
  priest: 'Shadow', deathknight: 'Frost', shaman: 'Elemental', mage: 'Fire',
  warlock: 'Affliction', monk: 'Windwalker', druid: 'Balance', demonhunter: 'Havoc',
  evoker: 'Devastation',
};

/** Générateur pseudo-aléatoire stable par personnage (mulberry32). */
function seededRandom(seed: string): () => number {
  let state = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoSpec(className: string): string {
  const key = className.toLowerCase().replace(/[^a-z]/g, '');
  return DEMO_SPECS[key] ?? 'Damage';
}

function mockRaid(ref: WclCharacterRef, season: WclSeason, params: RaidQuery): RaidPerformance {
  const rand = seededRandom(`${ref.name}|raid|${params.difficulty ?? 0}|${params.metric}`);
  const spec = params.spec ?? demoSpec(ref.className);
  const zones = season.raids.map((zone) => {
    const killed = Math.max(1, Math.floor(zone.encounters.length * (0.4 + rand() * 0.6)));
    const raw: RawZoneRankings = {
      difficulty: params.difficulty ?? 4,
      allStars: [
        { spec, points: 300 + rand() * 600, possiblePoints: 1200, rank: 1000 + Math.floor(rand() * 30000),
          regionRank: 500 + Math.floor(rand() * 8000), serverRank: 1 + Math.floor(rand() * 60),
          rankPercent: 40 + rand() * 60, total: 80000 },
      ],
      rankings: zone.encounters.map((enc, i) => {
        if (i >= killed) return { encounter: { id: enc.id, name: enc.name.en }, totalKills: 0 };
        const best = 25 + rand() * 75;
        return {
          encounter: { id: enc.id, name: enc.name.en },
          rankPercent: best,
          medianPercent: best * (0.7 + rand() * 0.3),
          totalKills: 1 + Math.floor(rand() * 6),
          fastestKill: 240_000 + Math.floor(rand() * 240_000),
          lockedIn: true,
          spec,
          bestAmount: 120_000 + rand() * 90_000,
          bestRank: { ilvl: 310 + Math.floor(rand() * 15) },
          allStars: { points: 40 + rand() * 80, rank: 1 + Math.floor(rand() * 40000),
            regionRank: 1 + Math.floor(rand() * 9000), serverRank: 1 + Math.floor(rand() * 40),
            rankPercent: best, total: 60000 },
        };
      }),
    };
    return buildRaidZone(zone, raw);
  });
  return { source: 'mock', metric: params.metric, spec: params.spec ?? null, zones };
}

function mockMythicPlus(ref: WclCharacterRef, season: WclSeason, metric: WclMetric): MythicPlusPerformance {
  const rand = seededRandom(`${ref.name}|mplus|${metric}`);
  const spec = demoSpec(ref.className);
  const throughputRankings: RawZoneRankings['throughputRankings'] = {};
  const rankings = season.mythicPlus.encounters.map((enc) => {
    const keyLevel = 10 + Math.floor(rand() * 8);
    const score = 300 + keyLevel * 7 + rand() * 20;
    const percentile = 50 + rand() * 50;
    const duration = 1_500_000 + Math.floor(rand() * 500_000);
    throughputRankings[String(enc.id)] = {
      best_per_second_amount: 180_000 + rand() * 120_000,
      best_level: keyLevel,
      best_historical_percentile: Math.round(20 + rand() * 80),
      median_historical_percentile: Math.round(15 + rand() * 60),
    };
    return {
      encounter: { id: enc.id, name: enc.name.en },
      rankPercent: percentile,
      totalKills: 1 + Math.floor(rand() * 12),
      spec,
      bestAmount: score,
      bestRank: { ilvl: keyLevel, speed: duration - keyLevel * KEY_SPEED_LEVEL_FACTOR },
      allStars: { points: score, rank: 1 + Math.floor(rand() * 40000), regionRank: 1 + Math.floor(rand() * 15000),
        serverRank: 1 + Math.floor(rand() * 90), rankPercent: percentile, total: 300000 },
    };
  });
  const total = rankings.reduce((sum, r) => sum + r.bestAmount, 0);
  const raw: RawZoneRankings = {
    allStars: [
      { spec, points: total, possiblePoints: 960, rank: 1 + Math.floor(rand() * 40000),
        regionRank: 1 + Math.floor(rand() * 15000), serverRank: 1 + Math.floor(rand() * 90),
        rankPercent: 60 + rand() * 40, total: 190000 },
    ],
    rankings,
    throughputRankings,
  };
  return buildMythicPlus(season.mythicPlus, raw, metric, 'mock');
}
