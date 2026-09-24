import pool from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { TtlCache } from '../lib/ttlCache';
import { WclLocale, isWclConfigured, wclQuery } from '../lib/wclClient';
import { encounterIconUrl, zoneImageUrl } from '../lib/wclAssets';
import { MVP_RULES, MVP_WEIGHTS, flagPrematureDeaths, scorePlayers } from './raidMvpScoring';

/**
 * Analyse d'un rapport Warcraft Logs rattaché à un événement raid : synthèse des pulls de boss,
 * performances par joueur (parses, morts, consommables, utilité) et classement MVP.
 */

export type RaidRole = 'tank' | 'healer' | 'dps';

export interface MvpBreakdown {
  performance: number;
  output: number;
  survival: number;
  preparation: number;
  utility: number;
}

export interface ReportDeath {
  actorId: number;
  /** Depuis le début du pull. */
  timeMs: number;
  ability: string | null;
  abilityIcon: string | null;
  premature: boolean;
}

export interface ReportPullPlayer {
  actorId: number;
  role: RaidRole;
  spec: string | null;
  dps: number;
  hps: number;
  /** Temps actif en % de la durée du pull. */
  activeTime: number;
  /** Percentile WCL (kills classés uniquement). */
  parse: number | null;
  ilvlParse: number | null;
  died: boolean;
  prematureDeath: boolean;
  combatPotions: number;
  flask: boolean;
  food: boolean;
}

export interface ReportPull {
  id: number;
  encounterId: number;
  name: string;
  difficulty: number;
  kill: boolean;
  /** Vie restante du boss en % (0 sur un kill). */
  bossPercent: number;
  durationMs: number;
  /** Début du pull depuis le début du rapport. */
  offsetMs: number;
  size: number;
  itemLevel: number | null;
  raidDps: number;
  raidHps: number;
  deaths: ReportDeath[];
  players: ReportPullPlayer[];
}

export interface ReportEncounter {
  id: number;
  name: string;
  difficulty: number;
  iconUrl: string;
  pullIds: number[];
  kill: boolean;
  /** Meilleur essai : vie restante du boss en % (0 si tué). */
  bestPercent: number;
  killDurationMs: number | null;
}

export interface ReportPlayer {
  actorId: number;
  name: string;
  server: string;
  classId: string;
  spec: string | null;
  role: RaidRole;
  itemLevel: number | null;
  pulls: number;
  kills: number;
  avgParse: number | null;
  bestParse: number | null;
  avgIlvlParse: number | null;
  damageDone: number;
  healingDone: number;
  /** Moyennes sur le temps de combat du joueur (pulls joués). */
  dps: number;
  hps: number;
  deaths: number;
  prematureDeaths: number;
  combatPotions: number;
  potionPulls: number;
  potionEligiblePulls: number;
  flaskPulls: number;
  foodPulls: number;
  healthstones: number;
  interrupts: number;
  dispels: number;
  score: number;
  breakdown: MvpBreakdown;
  eligible: boolean;
  rank: number;
}

export interface ReportAnalysis {
  report: {
    code: string;
    url: string;
    title: string;
    owner: string | null;
    zone: { id: number; name: string; imageUrl: string } | null;
    startTime: number;
    endTime: number;
  };
  summary: {
    difficulty: number | null;
    pulls: number;
    kills: number;
    wipes: number;
    encounters: number;
    bossesKilled: number;
    combatTimeMs: number;
    elapsedMs: number;
    deaths: number;
    prematureDeaths: number;
    itemLevel: number | null;
    avgParse: number | null;
    potionRate: number | null;
    raidDps: number;
    raidHps: number;
  };
  encounters: ReportEncounter[];
  pulls: ReportPull[];
  /** Triés par rang MVP. */
  players: ReportPlayer[];
  mvpActorId: number | null;
  scoring: {
    weights: MvpBreakdown;
    minAttendance: number;
    deathPenalty: number;
    wipeCutoffRatio: number;
    potionMinPullMs: number;
  };
  /** Les classements WCL ne sont pas encore disponibles pour tous les kills. */
  rankingsPending: boolean;
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Consommables                                                         */
/* ------------------------------------------------------------------ */

/**
 * Potions de combat de la saison, complétées par la détection par icône (`alchemy…potion`).
 * Les potions de mana comptent : c'est la potion de combat d'un soigneur.
 */
const COMBAT_POTION_IDS = new Set([
  1236616, // Light's Potential
  1236994, // Potion of Recklessness
]);
const HEALTHSTONE_IDS = [
  6262, // Healthstone
  452930, // Demonic Healthstone
  1234768, // Silvermoon Health Potion
  1295247, // Concentrated Silvermoon Health Potion
];

interface WclAbility {
  gameID: number;
  name: string;
  icon: string;
}

function consumableAbilities(abilities: WclAbility[]) {
  const potions = abilities.filter(
    (a) =>
      COMBAT_POTION_IDS.has(a.gameID) ||
      // Les flacons de la saison ont aussi « potion » dans leur icône (`…flask_sindoreipotion…`).
      (/alchemy.*potion/i.test(a.icon) && !/flask|health|heal/i.test(a.icon)),
  );
  const flasks = abilities.filter((a) => /flask/i.test(a.icon));
  const food = abilities.filter((a) => /^spell_misc_food/i.test(a.icon));
  return {
    potionIds: [...new Set(potions.map((a) => a.gameID))],
    flaskIds: [...new Set(flasks.map((a) => a.gameID))],
    foodIds: [...new Set(food.map((a) => a.gameID))],
  };
}

/* ------------------------------------------------------------------ */
/* Requêtes WCL                                                         */
/* ------------------------------------------------------------------ */

interface WclFight {
  id: number;
  name: string;
  encounterID: number;
  difficulty: number | null;
  kill: boolean | null;
  fightPercentage: number | null;
  startTime: number;
  endTime: number;
  size: number | null;
  averageItemLevel: number | null;
}

interface WclActor {
  id: number;
  name: string;
  server: string | null;
  subType: string;
}

interface ReportMeta {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  owner: { name: string } | null;
  zone: { id: number; name: string } | null;
  fights: WclFight[];
  masterData: { actors: WclActor[]; abilities: WclAbility[] };
}

interface TableEntry {
  id: number;
  total: number;
  activeTime?: number;
}

interface PlayerDetail {
  id: number;
  icon: string;
  specs: { spec: string }[];
  minItemLevel?: number;
  maxItemLevel?: number;
}

interface PlayerDetails {
  tanks?: PlayerDetail[];
  healers?: PlayerDetail[];
  dps?: PlayerDetail[];
}

interface RankedCharacter {
  name: string;
  server: { name: string };
  rankPercent: number | null;
  bracketPercent: number | null;
}

interface FightRankings {
  fightID: number;
  roles: Record<'tanks' | 'healers' | 'dps', { characters: RankedCharacter[] } | undefined>;
}

interface Aura {
  id: number;
  bands: { startTime: number; endTime: number }[];
}

interface WclEvent {
  timestamp: number;
  fight: number;
  targetID?: number;
  sourceID?: number;
  killingAbilityGameID?: number;
}

const META_QUERY = `
  query ($code: String!) {
    reportData {
      report(code: $code) {
        code
        title
        startTime
        endTime
        owner { name }
        zone { id name }
        fights(killType: Encounters) {
          id name encounterID difficulty kill fightPercentage startTime endTime size averageItemLevel
        }
        masterData {
          actors(type: "Player") { id name server subType }
          abilities { gameID name icon }
        }
      }
    }
  }
`;

const FIGHTS_PER_REQUEST = 5;
const MAX_CONCURRENT_REQUESTS = 3;
const HEAVY_TIMEOUT_MS = 30_000;

/** Tables par pull (dégâts, soins, rôles) : requêtes groupées par alias GraphQL. */
async function fetchFightTables(code: string, fightIds: number[], locale: WclLocale) {
  const chunks: number[][] = [];
  for (let i = 0; i < fightIds.length; i += FIGHTS_PER_REQUEST) {
    chunks.push(fightIds.slice(i, i + FIGHTS_PER_REQUEST));
  }

  const results = await mapWithConcurrency(chunks, MAX_CONCURRENT_REQUESTS, async (ids) => {
    const fields = ids
      .map(
        (id) => `
          d${id}: table(fightIDs: [${id}], dataType: DamageDone)
          h${id}: table(fightIDs: [${id}], dataType: Healing)
          p${id}: playerDetails(fightIDs: [${id}])`,
      )
      .join('\n');
    const data = await wclQuery<{ reportData: { report: Record<string, { data: unknown }> } }>(
      `query ($code: String!) { reportData { report(code: $code) { ${fields} } } }`,
      { code },
      { locale, timeout: HEAVY_TIMEOUT_MS },
    );
    return data.reportData.report;
  });

  const tables = new Map<
    number,
    { damage: TableEntry[]; healing: TableEntry[]; details: PlayerDetails }
  >();
  const merged = Object.assign({}, ...results) as Record<string, { data: any } | undefined>;
  for (const id of fightIds) {
    tables.set(id, {
      damage: merged[`d${id}`]?.data?.entries ?? [],
      healing: merged[`h${id}`]?.data?.entries ?? [],
      details: merged[`p${id}`]?.data?.playerDetails ?? {},
    });
  }
  return tables;
}

/** Tables sur l'ensemble des pulls : classements, interruptions, dissipations, buffs consommables. */
async function fetchReportTables(
  code: string,
  fightIds: number[],
  killIds: number[],
  buffIds: number[],
  locale: WclLocale,
) {
  const buffFields = buffIds
    .map((id) => `b${id}: table(fightIDs: $fights, dataType: Buffs, abilityID: ${id})`)
    .join('\n');
  const data = await wclQuery<{ reportData: { report: Record<string, { data: any } | null> } }>(
    `query ($code: String!, $fights: [Int]!, $kills: [Int]!) {
      reportData {
        report(code: $code) {
          ${killIds.length ? 'rankings: rankings(fightIDs: $kills)' : ''}
          interrupts: table(fightIDs: $fights, dataType: Interrupts)
          dispels: table(fightIDs: $fights, dataType: Dispels)
          ${buffFields}
        }
      }
    }`,
    { code, fights: fightIds, kills: killIds },
    { locale, timeout: HEAVY_TIMEOUT_MS },
  );
  const report = data.reportData.report;
  const auras = new Map<number, Aura[]>(
    buffIds.map((id) => [id, (report[`b${id}`] as any)?.data?.auras ?? []]),
  );
  return {
    rankings: ((report.rankings as any)?.data ?? []) as FightRankings[],
    interrupts: countByActor(report.interrupts?.data),
    dispels: countByActor(report.dispels?.data),
    auras,
  };
}

/** Événements paginés (morts, soins d'urgence) sur les pulls de boss. */
async function fetchEvents(
  code: string,
  fightIds: number[],
  dataType: 'Deaths' | 'Casts',
  filterExpression: string | null,
  locale: WclLocale,
): Promise<WclEvent[]> {
  const events: WclEvent[] = [];
  let startTime: number | null = 0;
  while (startTime !== null) {
    const data: any = await wclQuery(
      `query ($code: String!, $fights: [Int]!, $start: Float, $filter: String) {
        reportData {
          report(code: $code) {
            events(fightIDs: $fights, startTime: $start, dataType: ${dataType},
                   hostilityType: Friendlies, filterExpression: $filter, limit: 10000) {
              data
              nextPageTimestamp
            }
          }
        }
      }`,
      { code, fights: fightIds, start: startTime, filter: filterExpression },
      { locale, timeout: HEAVY_TIMEOUT_MS },
    );
    const page = data.reportData.report.events;
    events.push(...(page?.data ?? []));
    startTime = page?.nextPageTimestamp ?? null;
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Somme des `details[].total` par acteur, quelle que soit la profondeur des tables Interrupts/Dispels. */
function countByActor(table: unknown): Map<number, number> {
  const counts = new Map<number, number>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (Array.isArray(node.details)) {
      for (const d of node.details) {
        if (typeof d.id === 'number') counts.set(d.id, (counts.get(d.id) ?? 0) + (d.total ?? 0));
      }
      return;
    }
    visit(node.entries);
  };
  visit(table);
  return counts;
}

/** Nom de classe WCL (`DeathKnight`) vers l'identifiant utilisé par le frontend (`death-knight`). */
const classId = (type: string) => type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

/** Clé nom + royaume insensible aux espaces, apostrophes et à la casse (`Khaz Modan` = `KhazModan`). */
const characterKey = (name: string, server: string | null | undefined) =>
  `${name.toLocaleLowerCase()}|${(server ?? '').toLocaleLowerCase().replace(/[^\p{L}]/gu, '')}`;

const round = (value: number, decimals = 0) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/** Un buff (flacon, nourriture, potion) couvre-t-il le début du pull ? */
const activeAtPull = (bands: Aura['bands'] | undefined, fight: WclFight) =>
  !!bands?.some((b) => b.startTime <= fight.startTime + 2000 && b.endTime >= fight.startTime);

/** Nombre d'utilisations d'un buff pendant le pull (pré-potion comprise). */
const usesDuringPull = (bands: Aura['bands'] | undefined, fight: WclFight) =>
  bands?.filter((b) => b.startTime <= fight.endTime && b.endTime >= fight.startTime).length ?? 0;

/* ------------------------------------------------------------------ */
/* Service                                                              */
/* ------------------------------------------------------------------ */

const ROLE_LISTS: [keyof PlayerDetails, RaidRole][] = [
  ['tanks', 'tank'],
  ['healers', 'healer'],
  ['dps', 'dps'],
];

const cache = new TtlCache<ReportAnalysis>(30 * 60_000, 50);
const LIVE_REPORT_WINDOW_MS = 2 * 3600_000;
const SHORT_TTL_MS = 3 * 60_000;
const LONG_TTL_MS = 6 * 3600_000;

export class WclReportService {
  /** Code d'un rapport depuis son URL (`…warcraftlogs.com/reports/<code>#fight=…`). */
  static extractReportCode(url: string | null | undefined): string | null {
    const match = url?.match(/warcraftlogs\.com\/reports\/((?:a:)?[a-zA-Z0-9]{16})(?![a-zA-Z0-9])/);
    return match ? match[1] : null;
  }

  /** Analyse du rapport lié à un événement raid de la guilde active. */
  static async getEventAnalysis(
    eventId: string,
    guildId: string,
    locale: WclLocale,
  ): Promise<ReportAnalysis> {
    const { rows } = await pool.query(
      'SELECT type, logs FROM events WHERE id = $1 AND guild_id = $2',
      [eventId, guildId],
    );
    const event = rows[0];
    if (!event || event.type?.toLowerCase() !== 'raid' || !event.logs) {
      throw new HttpError(404, 'No Warcraft Logs report for this event', 'LOGS_NOT_FOUND');
    }
    const code = this.extractReportCode(event.logs);
    if (!code) throw new HttpError(422, 'Invalid Warcraft Logs report URL', 'WCL_INVALID_URL');
    if (!isWclConfigured()) {
      throw new HttpError(503, 'Warcraft Logs is not configured', 'WCL_UNAVAILABLE');
    }

    // Rapport récent (encore en cours d'enregistrement ou classements WCL en attente) : cache court.
    const ttl = (analysis: ReportAnalysis) =>
      analysis.rankingsPending || Date.now() - analysis.report.endTime < LIVE_REPORT_WINDOW_MS
        ? SHORT_TTL_MS
        : LONG_TTL_MS;

    try {
      return await cache.getOrLoad(`${code}:${locale}`, () => this.analyze(code, locale), ttl);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'WCL_NOT_FOUND') {
        throw new HttpError(404, 'Warcraft Logs report not found or private', 'WCL_REPORT_NOT_FOUND');
      }
      throw err;
    }
  }

  private static async analyze(code: string, locale: WclLocale): Promise<ReportAnalysis> {
    const meta = (
      await wclQuery<{ reportData: { report: ReportMeta | null } }>(META_QUERY, { code }, { locale })
    ).reportData.report;
    if (!meta) throw new HttpError(404, 'Report not found', 'WCL_NOT_FOUND');

    const fights = [...meta.fights]
      .filter((f) => f.encounterID > 0 && f.endTime > f.startTime)
      .sort((a, b) => a.startTime - b.startTime);
    const fightIds = fights.map((f) => f.id);
    const killIds = fights.filter((f) => f.kill).map((f) => f.id);
    const actors = new Map(
      meta.masterData.actors.filter((a) => a.subType !== 'Unknown').map((a) => [a.id, a]),
    );
    const abilityById = new Map(meta.masterData.abilities.map((a) => [a.gameID, a]));
    const { potionIds, flaskIds, foodIds } = consumableAbilities(meta.masterData.abilities);

    const [fightTables, reportTables, deathEvents, healthstoneEvents] = fightIds.length
      ? await Promise.all([
          fetchFightTables(code, fightIds, locale),
          fetchReportTables(code, fightIds, killIds, [...potionIds, ...flaskIds, ...foodIds], locale),
          fetchEvents(code, fightIds, 'Deaths', null, locale),
          fetchEvents(
            code,
            fightIds,
            'Casts',
            `ability.id in (${HEALTHSTONE_IDS.join(',')})`,
            locale,
          ),
        ])
      : [new Map(), null, [], []];

    // Parses : fightID → clé personnage → percentiles.
    const parses = new Map<number, Map<string, { parse: number | null; ilvl: number | null }>>();
    for (const ranking of reportTables?.rankings ?? []) {
      const byCharacter = new Map<string, { parse: number | null; ilvl: number | null }>();
      for (const list of Object.values(ranking.roles ?? {})) {
        for (const c of list?.characters ?? []) {
          byCharacter.set(characterKey(c.name, c.server?.name), {
            parse: c.rankPercent ?? null,
            ilvl: c.bracketPercent ?? null,
          });
        }
      }
      parses.set(ranking.fightID, byCharacter);
    }

    const aurasFor = (ids: number[], actorId: number) =>
      ids.flatMap(
        (id) => reportTables?.auras.get(id)?.find((a) => a.id === actorId)?.bands ?? [],
      );

    /* ---------- Pulls ---------- */
    const pulls: ReportPull[] = fights.map((fight) => {
      const durationMs = fight.endTime - fight.startTime;
      const seconds = durationMs / 1000;
      const tables = fightTables.get(fight.id);
      const damage = new Map<number, TableEntry>(
        (tables?.damage ?? []).map((e: TableEntry) => [e.id, e]),
      );
      const healing = new Map<number, TableEntry>(
        (tables?.healing ?? []).map((e: TableEntry) => [e.id, e]),
      );
      const size = fight.size ?? 0;

      const deaths = flagPrematureDeaths(
        deathEvents.filter(
          (e) => e.fight === fight.id && e.targetID !== undefined && actors.has(e.targetID),
        ),
        size,
        !!fight.kill,
      ).map<ReportDeath>((e) => {
        const ability = e.killingAbilityGameID ? abilityById.get(e.killingAbilityGameID) : undefined;
        return {
          actorId: e.targetID!,
          timeMs: e.timestamp - fight.startTime,
          ability: ability?.name ?? null,
          abilityIcon: ability?.icon ?? null,
          premature: e.premature,
        };
      });

      const players: ReportPullPlayer[] = [];
      for (const [list, role] of ROLE_LISTS) {
        for (const detail of tables?.details[list] ?? []) {
          const actor = actors.get(detail.id);
          if (!actor) continue;
          const dmg = damage.get(detail.id);
          const heal = healing.get(detail.id);
          const activeMs = Math.max(dmg?.activeTime ?? 0, heal?.activeTime ?? 0);
          const parse = parses.get(fight.id)?.get(characterKey(actor.name, actor.server));
          const death = deaths.find((d) => d.actorId === detail.id);
          players.push({
            actorId: detail.id,
            role,
            spec: detail.specs?.[0]?.spec ?? null,
            dps: seconds ? round((dmg?.total ?? 0) / seconds) : 0,
            hps: seconds ? round((heal?.total ?? 0) / seconds) : 0,
            activeTime: durationMs ? Math.min(100, round((100 * activeMs) / durationMs, 1)) : 0,
            parse: parse?.parse ?? null,
            ilvlParse: parse?.ilvl ?? null,
            died: !!death,
            prematureDeath: !!death?.premature,
            combatPotions: usesDuringPull(aurasFor(potionIds, detail.id), fight),
            flask: activeAtPull(aurasFor(flaskIds, detail.id), fight),
            food: activeAtPull(aurasFor(foodIds, detail.id), fight),
          });
        }
      }

      const sum = (key: 'dps' | 'hps') => players.reduce((total, p) => total + p[key], 0);
      return {
        id: fight.id,
        encounterId: fight.encounterID,
        name: fight.name,
        difficulty: fight.difficulty ?? 0,
        kill: !!fight.kill,
        bossPercent: fight.kill ? 0 : round(fight.fightPercentage ?? 100, 2),
        durationMs,
        offsetMs: fight.startTime,
        size: size || players.length,
        itemLevel: fight.averageItemLevel ? round(fight.averageItemLevel, 1) : null,
        raidDps: sum('dps'),
        raidHps: sum('hps'),
        deaths,
        players,
      };
    });

    /* ---------- Rencontres ---------- */
    const encounters = new Map<string, ReportEncounter>();
    for (const pull of pulls) {
      const key = `${pull.encounterId}:${pull.difficulty}`;
      const encounter = encounters.get(key) ?? {
        id: pull.encounterId,
        name: pull.name,
        difficulty: pull.difficulty,
        iconUrl: encounterIconUrl(pull.encounterId),
        pullIds: [],
        kill: false,
        bestPercent: 100,
        killDurationMs: null,
      };
      encounter.pullIds.push(pull.id);
      encounter.bestPercent = Math.min(encounter.bestPercent, pull.bossPercent);
      if (pull.kill) {
        encounter.kill = true;
        encounter.killDurationMs = Math.min(encounter.killDurationMs ?? Infinity, pull.durationMs);
      }
      encounters.set(key, encounter);
    }

    /* ---------- Joueurs ---------- */
    const healthstones = new Map<number, number>();
    for (const e of healthstoneEvents) {
      if (e.sourceID !== undefined) healthstones.set(e.sourceID, (healthstones.get(e.sourceID) ?? 0) + 1);
    }

    const playerIds = [...new Set(pulls.flatMap((p) => p.players.map((pp) => pp.actorId)))];
    const drafts = playerIds.map((actorId) => {
      const actor = actors.get(actorId)!;
      const played = pulls.flatMap((pull) => {
        const me = pull.players.find((p) => p.actorId === actorId);
        return me ? [{ pull, me }] : [];
      });

      // Rôle et spécialisation les plus joués.
      const mostPlayed = <K extends string>(values: (K | null)[]) => {
        const counts = new Map<K, number>();
        for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      };
      const role = mostPlayed(played.map(({ me }) => me.role)) ?? 'dps';
      const combatMs = played.reduce((sum, { pull }) => sum + pull.durationMs, 0);
      const damageDone = played.reduce((sum, { pull, me }) => sum + (me.dps * pull.durationMs) / 1000, 0);
      const healingDone = played.reduce((sum, { pull, me }) => sum + (me.hps * pull.durationMs) / 1000, 0);
      const parseValues = played.map(({ me }) => me.parse).filter((v): v is number => v !== null);
      const ilvlValues = played.map(({ me }) => me.ilvlParse).filter((v): v is number => v !== null);
      const eligiblePotion = played.filter(
        ({ pull }) => pull.kill || pull.durationMs >= MVP_RULES.potionMinPullMs,
      );
      const itemLevels = played
        .map(({ pull }) =>
          ROLE_LISTS.flatMap(([list]) => fightTables.get(pull.id)?.details[list] ?? []).find(
            (d: PlayerDetail) => d.id === actorId,
          )?.maxItemLevel,
        )
        .filter((v): v is number => !!v);

      return {
        actorId,
        name: actor.name,
        server: actor.server ?? '',
        classId: classId(actor.subType),
        spec: mostPlayed(played.filter(({ me }) => me.role === role).map(({ me }) => me.spec)),
        role,
        itemLevel: itemLevels.length ? Math.max(...itemLevels) : null,
        pulls: played.length,
        kills: played.filter(({ pull }) => pull.kill).length,
        avgParse: average(parseValues) === null ? null : round(average(parseValues)!, 1),
        bestParse: parseValues.length ? Math.max(...parseValues) : null,
        avgIlvlParse: average(ilvlValues) === null ? null : round(average(ilvlValues)!, 1),
        damageDone: round(damageDone),
        healingDone: round(healingDone),
        dps: combatMs ? round((damageDone * 1000) / combatMs) : 0,
        hps: combatMs ? round((healingDone * 1000) / combatMs) : 0,
        deaths: played.filter(({ me }) => me.died).length,
        prematureDeaths: played.filter(({ me }) => me.prematureDeath).length,
        combatPotions: played.reduce((sum, { me }) => sum + me.combatPotions, 0),
        potionPulls: eligiblePotion.filter(({ me }) => me.combatPotions > 0).length,
        potionEligiblePulls: eligiblePotion.length,
        flaskPulls: played.filter(({ me }) => me.flask).length,
        foodPulls: played.filter(({ me }) => me.food).length,
        healthstones: healthstones.get(actorId) ?? 0,
        interrupts: reportTables?.interrupts.get(actorId) ?? 0,
        dispels: reportTables?.dispels.get(actorId) ?? 0,
      };
    });

    const scores = scorePlayers(pulls, drafts);
    const players: ReportPlayer[] = drafts
      .map((d) => {
        const s = scores.get(d.actorId)!;
        return { ...d, score: s.score, breakdown: s.breakdown, eligible: s.eligible, rank: 0 };
      })
      .sort(
        (a, b) =>
          Number(b.eligible) - Number(a.eligible) ||
          b.score - a.score ||
          (b.avgParse ?? -1) - (a.avgParse ?? -1),
      )
      .map((p, index) => ({ ...p, rank: index + 1 }));

    /* ---------- Synthèse ---------- */
    const combatTimeMs = pulls.reduce((sum, p) => sum + p.durationMs, 0);
    const allParses = players.map((p) => p.avgParse).filter((v): v is number => v !== null);
    const potionEligible = players.reduce((sum, p) => sum + p.potionEligiblePulls, 0);
    const weightedRate = (key: 'raidDps' | 'raidHps') =>
      combatTimeMs
        ? round(pulls.reduce((sum, p) => sum + p[key] * p.durationMs, 0) / combatTimeMs)
        : 0;
    const itemLevels = pulls.map((p) => p.itemLevel).filter((v): v is number => v !== null);
    const encounterList = [...encounters.values()];
    const rankedKills = new Set((reportTables?.rankings ?? []).map((r) => r.fightID));

    return {
      report: {
        code,
        url: `https://${locale === 'fr' ? 'fr' : 'www'}.warcraftlogs.com/reports/${code}`,
        title: meta.title,
        owner: meta.owner?.name ?? null,
        zone: meta.zone
          ? { id: meta.zone.id, name: meta.zone.name, imageUrl: zoneImageUrl(meta.zone.id) }
          : null,
        startTime: meta.startTime,
        endTime: meta.endTime,
      },
      summary: {
        difficulty: pulls.length ? Math.max(...pulls.map((p) => p.difficulty)) : null,
        pulls: pulls.length,
        kills: pulls.filter((p) => p.kill).length,
        wipes: pulls.filter((p) => !p.kill).length,
        encounters: encounterList.length,
        bossesKilled: encounterList.filter((e) => e.kill).length,
        combatTimeMs,
        elapsedMs: pulls.length
          ? pulls[pulls.length - 1].offsetMs + pulls[pulls.length - 1].durationMs - pulls[0].offsetMs
          : 0,
        deaths: pulls.reduce((sum, p) => sum + p.deaths.length, 0),
        prematureDeaths: pulls.reduce((sum, p) => sum + p.deaths.filter((d) => d.premature).length, 0),
        itemLevel: average(itemLevels) === null ? null : round(average(itemLevels)!, 1),
        avgParse: average(allParses) === null ? null : round(average(allParses)!, 1),
        potionRate: potionEligible
          ? round(players.reduce((sum, p) => sum + p.potionPulls, 0) / potionEligible, 3)
          : null,
        raidDps: weightedRate('raidDps'),
        raidHps: weightedRate('raidHps'),
      },
      encounters: encounterList,
      pulls,
      players,
      mvpActorId: players.find((p) => p.eligible)?.actorId ?? null,
      scoring: {
        weights: { ...MVP_WEIGHTS },
        minAttendance: MVP_RULES.minAttendance,
        deathPenalty: MVP_RULES.deathPenalty,
        wipeCutoffRatio: MVP_RULES.wipeCutoffRatio,
        potionMinPullMs: MVP_RULES.potionMinPullMs,
      },
      rankingsPending: killIds.some((id) => !rankedKills.has(id)),
      generatedAt: new Date().toISOString(),
    };
  }
}
