import axios from 'axios';
import pool from '../lib/db';
import { Event } from './eventService';

export interface WclPlayerPerf {
  name: string;
  class: string;
  role: 'tank' | 'heal' | 'dps';
  dps: number;
  hps: number;
  deaths: number;
  avoidableDeaths: number;
  damageTaken: number;
  activeTime: number; // percentage
  parse: number;
}

export interface WclFight {
  id: number;
  name: string;
  difficulty: string;
  kill: boolean;
  duration: number; // in seconds
  bossPercentage: number;
  deathsCount: number;
  averageDps: number;
  averageHps: number;
  players: WclPlayerPerf[];
}

export interface WclMvpEntry {
  name: string;
  class: string;
  score: number;
  dpsTotal: number;
  hpsTotal: number;
  deathsCount: number;
  damageTakenSum: number;
}

export interface WclReportMetrics {
  title: string;
  zone: string;
  owner: string;
  totalDuration: number; // seconds
  totalKills: number;
  totalWipes: number;
  totalDamage: number;
  totalHealing: number;
  raidAvgDps: number;
  raidAvgHps: number;
  totalDeaths: number;
  avgActiveTime: number;
  mostDeadlyBoss: string;
  mvpPlayer: { name: string; class: string; score: number };
  mostDiedPlayer: { name: string; class: string; deaths: number } | null;
  leastDiedPlayer: { name: string; class: string; deaths: number } | null;
  mvpLeaderboard: WclMvpEntry[];
  fights: WclFight[];
  wclKeysMissing?: boolean;
}

const CLASS_ROLES: Record<string, 'tank' | 'heal' | 'dps'> = {
  'deathknight': 'tank',
  'demonhunter': 'tank',
  'druid': 'heal',
  'monk': 'tank',
  'paladin': 'heal',
  'warrior': 'tank',
  'priest': 'heal',
  'shaman': 'heal',
  'evoker': 'heal',
  'hunter': 'dps',
  'mage': 'dps',
  'rogue': 'dps',
  'warlock': 'dps'
};

const WOW_CLASSES = [
  'deathknight', 'demonhunter', 'druid', 'monk', 'paladin', 'warrior',
  'priest', 'shaman', 'evoker', 'hunter', 'mage', 'rogue', 'warlock'
];

export function getRoleFromIcon(icon: string): 'tank' | 'heal' | 'dps' {
  if (!icon) return 'dps';
  const spec = icon.split('-')[1] || '';
  if (['Restoration', 'Holy', 'Mistweaver', 'Discipline', 'Preservation'].includes(spec)) {
    return 'heal';
  }
  if (['Protection', 'Guardian', 'Brewmaster', 'Blood', 'Vengeance'].includes(spec)) {
    return 'tank';
  }
  return 'dps';
}

export class WclService {
  /**
   * Extract report code from a Warcraft Logs report URL
   */
  static extractReportCode(url: string): string | null {
    if (!url) return null;
    const match = url.match(/\/reports\/([a-zA-Z0-9]{16,})/);
    return match ? match[1] : null;
  }

  /**
   * Fetch OAuth2 token from Warcraft Logs
   */
  private static async getAccessToken(): Promise<string | null> {
    const clientId = process.env.WCL_CLIENT_ID;
    const clientSecret = process.env.WCL_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId.includes('your_') || clientSecret.includes('your_')) {
      return null;
    }

    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await axios.post(
        'https://www.warcraftlogs.com/oauth/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000
        }
      );
      return response.data.access_token || null;
    } catch (err) {
      console.warn('[WCL API] Error acquiring access token:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Fetch metrics for a specific event
   */
  static async getMetricsForEvent(eventId: string): Promise<WclReportMetrics | null> {
    // 1. Fetch event from database
    const eventRes = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
    const event: Event = eventRes.rows[0];

    if (!event || !event.logs || event.type.toLowerCase() !== 'raid') {
      return null;
    }

    const reportCode = this.extractReportCode(event.logs);
    const token = await this.getAccessToken();

    // 2. Fetch roster/signups members to seed performance data realistically
    const signupsRes = await pool.query(`
      SELECT es.role, es.status, c.name as character_name, c.class as character_class
      FROM event_signups es
      JOIN characters c ON es.character_id = c.id
      WHERE es.event_id = $1 AND es.status = 'signed_up'
    `, [eventId]);
    
    let participants = signupsRes.rows.map(row => ({
      name: row.character_name,
      class: (row.character_class || 'mage').toLowerCase().replace(/\s+/g, ''),
      role: row.role as 'tank' | 'heal' | 'dps'
    }));

    // If we have no participants, mock a typical raid group of 15 players
    if (participants.length === 0) {
      participants = [
        { name: 'Kaelthas', class: 'mage', role: 'dps' },
        { name: 'Uther', class: 'paladin', role: 'tank' },
        { name: 'Arthas', class: 'deathknight', role: 'tank' },
        { name: 'Jaina', class: 'mage', role: 'dps' },
        { name: 'Anduin', class: 'priest', role: 'heal' },
        { name: 'Tyrande', class: 'druid', role: 'heal' },
        { name: 'Illidan', class: 'demonhunter', role: 'dps' },
        { name: 'Sylvanas', class: 'hunter', role: 'dps' },
        { name: 'Malfurion', class: 'druid', role: 'heal' },
        { name: 'Thrall', class: 'shaman', role: 'dps' },
        { name: 'Garrosh', class: 'warrior', role: 'dps' },
        { name: 'Grommash', class: 'warrior', role: 'dps' },
        { name: 'Guldan', class: 'warlock', role: 'dps' },
        { name: 'Valeera', class: 'rogue', role: 'dps' },
        { name: 'Chen', class: 'monk', role: 'tank' }
      ];
    }

    // Ensure class tags are clean
    participants = participants.map(p => {
      let cls = p.class;
      if (cls === 'dk') cls = 'deathknight';
      if (cls === 'dh') cls = 'demonhunter';
      if (cls === 'drood') cls = 'druid';
      if (cls === 'hunt') cls = 'hunter';
      return { ...p, class: cls };
    });

    // 3. If token is available, try to retrieve report metadata from Warcraft Logs
    if (token && reportCode) {
      try {
        const query = `
          query ($code: String!) {
            reportData {
              report(code: $code) {
                title
                owner { name }
                zone { name }
                fights(killType: All) {
                  id
                  name
                  difficulty
                  kill
                  encounterID
                  fightPercentage
                  startTime
                  endTime
                }
                masterData {
                  actors(type: "Player") {
                    name
                    subType
                  }
                }
              }
            }
          }
        `;

        const response = await axios.post(
          'https://www.warcraftlogs.com/api/v2/client',
          { query, variables: { code: reportCode } },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000
          }
        );

        const apiReport = response.data?.data?.reportData?.report;
        if (apiReport) {
          // Convert API fights and fetch combat metrics in parallel
          const apiFights = apiReport.fights || [];
          const rawBossFights = apiFights.filter((f: any) => f.encounterID !== 0);

          const mappedFights: WclFight[] = [];

          await Promise.all(
            rawBossFights.map(async (f: any) => {
              const duration = Math.round((f.endTime - f.startTime) / 1000);
              const difficultyName = f.difficulty === 3 ? 'Normal' : (f.difficulty === 4 ? 'Heroic' : (f.difficulty === 5 ? 'Mythic' : 'Raid Finder'));
              
              try {
                const fightQuery = `
                  query ($code: String!, $fightId: Int!) {
                    reportData {
                      report(code: $code) {
                        damageTable: table(fightIDs: [$fightId], dataType: DamageDone)
                        healingTable: table(fightIDs: [$fightId], dataType: Healing)
                        damageTakenTable: table(fightIDs: [$fightId], dataType: DamageTaken)
                        rankings: rankings(fightIDs: [$fightId])
                        deathsTable: table(fightIDs: [$fightId], dataType: Deaths)
                      }
                    }
                  }
                `;

                const fightRes = await axios.post(
                  'https://www.warcraftlogs.com/api/v2/client',
                  { query: fightQuery, variables: { code: reportCode, fightId: f.id } },
                  {
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    timeout: 8500
                  }
                );

                const reportTables = fightRes.data?.data?.reportData?.report;
                if (reportTables) {
                  const dDone = reportTables.damageTable?.data?.entries || [];
                  const hDone = reportTables.healingTable?.data?.entries || [];
                  const dTaken = reportTables.damageTakenTable?.data?.entries || [];

                  // Parse Rankings to get real parses and official roles
                  const roleMap: Record<string, 'tank' | 'heal' | 'dps'> = {};
                  const parseMap: Record<string, number> = {};
                  const rankingsList = reportTables.rankings?.data || [];
                  if (rankingsList.length > 0) {
                    const roles = rankingsList[0].roles || {};
                    
                    const tanks = roles.tanks?.characters || [];
                    tanks.forEach((c: any) => {
                      if (c.name) {
                        roleMap[c.name] = 'tank';
                        if (c.rankPercent !== undefined) parseMap[c.name] = Math.round(c.rankPercent);
                      }
                    });

                    const healers = roles.healers?.characters || [];
                    healers.forEach((c: any) => {
                      if (c.name) {
                        roleMap[c.name] = 'heal';
                        if (c.rankPercent !== undefined) parseMap[c.name] = Math.round(c.rankPercent);
                      }
                    });

                    const dpsList = roles.dps?.characters || [];
                    dpsList.forEach((c: any) => {
                      if (c.name) {
                        roleMap[c.name] = 'dps';
                        if (c.rankPercent !== undefined) parseMap[c.name] = Math.round(c.rankPercent);
                      }
                    });
                  }

                  // Parse Deaths to get real deaths per player
                  const deathMap: Record<string, number> = {};
                  const deathsList = reportTables.deathsTable?.data?.entries || [];
                  deathsList.forEach((d: any) => {
                    if (d.name) {
                      deathMap[d.name] = (deathMap[d.name] || 0) + 1;
                    }
                  });

                  const playerMap: Record<string, WclPlayerPerf> = {};

                  // 1. Process Damage Done
                  dDone.forEach((entry: any) => {
                    const name = entry.name;
                    const className = (entry.type || 'Mage').toLowerCase().replace(/\s+/g, '');
                    if (!roleMap[name] && !WOW_CLASSES.includes(className)) {
                      return; // Skip boss / NPC
                    }
                    const dps = Math.round(entry.total / duration);
                    const activeTime = Math.min(100, parseFloat(((entry.activeTime / (duration * 1000)) * 100).toFixed(1))) || 100;
                    const deaths = deathMap[name] || 0;
                    const parse = parseMap[name] || 0;
                    const role = roleMap[name] || getRoleFromIcon(entry.icon) || CLASS_ROLES[className] || 'dps';

                    playerMap[name] = {
                      name,
                      class: className,
                      role,
                      dps,
                      hps: 0,
                      deaths,
                      avoidableDeaths: deaths,
                      damageTaken: 0,
                      activeTime,
                      parse
                    };
                  });

                  // 2. Process Healing Done
                  hDone.forEach((entry: any) => {
                    const name = entry.name;
                    const className = (entry.type || 'Priest').toLowerCase().replace(/\s+/g, '');
                    if (!roleMap[name] && !WOW_CLASSES.includes(className)) {
                      return; // Skip boss / NPC
                    }
                    const hps = Math.round(entry.total / duration);
                    const parse = parseMap[name] || 0;
                    const deaths = deathMap[name] || 0;
                    const computedRole = roleMap[name] || getRoleFromIcon(entry.icon);
                    
                    if (playerMap[name]) {
                      playerMap[name].hps = hps;
                      if (computedRole) {
                        playerMap[name].role = computedRole;
                      }
                    } else {
                      playerMap[name] = {
                        name,
                        class: className,
                        role: computedRole || CLASS_ROLES[className] || 'dps',
                        dps: 0,
                        hps,
                        deaths,
                        avoidableDeaths: deaths,
                        damageTaken: 0,
                        activeTime: Math.min(100, parseFloat(((entry.activeTime / (duration * 1000)) * 100).toFixed(1))) || 100,
                        parse
                      };
                    }
                  });

                  // 2.5 Ensure players who died but made 0 DPS/HPS are not ignored
                  Object.keys(deathMap).forEach(name => {
                    if (!playerMap[name]) {
                      const deathEntry = deathsList.find((d: any) => d.name === name);
                      const className = (deathEntry?.type || 'Mage').toLowerCase().replace(/\s+/g, '');
                      if (!roleMap[name] && !WOW_CLASSES.includes(className)) {
                        return; // Skip boss / NPC
                      }
                      const computedRole = roleMap[name] || getRoleFromIcon(deathEntry?.icon);
                      playerMap[name] = {
                        name,
                        class: className,
                        role: computedRole || CLASS_ROLES[className] || 'dps',
                        dps: 0,
                        hps: 0,
                        deaths: deathMap[name],
                        avoidableDeaths: deathMap[name],
                        damageTaken: 0,
                        activeTime: 0,
                        parse: 0
                      };
                    }
                  });

                  // 3. Process Damage Taken
                  dTaken.forEach((entry: any) => {
                    const name = entry.name;
                    if (playerMap[name]) {
                      playerMap[name].damageTaken = entry.total || 0;
                      const computedRole = roleMap[name] || getRoleFromIcon(entry.icon);
                      if (computedRole) {
                        playerMap[name].role = computedRole;
                      }
                    }
                  });

                  const playersList = Object.values(playerMap);
                  const totalDeaths = playersList.reduce((sum, p) => sum + p.deaths, 0);

                  let sumDps = 0;
                  let sumHps = 0;
                  let dpsCount = 0;
                  let healCount = 0;

                  playersList.forEach(p => {
                    if (p.role === 'heal') {
                      sumHps += p.hps;
                      healCount++;
                    } else {
                      sumDps += p.dps;
                      dpsCount++;
                    }
                  });

                  mappedFights.push({
                    id: f.id,
                    name: f.name,
                    difficulty: difficultyName,
                    kill: f.kill,
                    duration: duration,
                    bossPercentage: f.kill ? 0 : f.fightPercentage,
                    deathsCount: totalDeaths,
                    averageDps: dpsCount > 0 ? Math.round(sumDps / dpsCount) : 0,
                    averageHps: healCount > 0 ? Math.round(sumHps / healCount) : 0,
                    players: playersList
                  });
                } else {
                  // Basic fallback if table data is empty
                  mappedFights.push({
                    id: f.id,
                    name: f.name,
                    difficulty: difficultyName,
                    kill: f.kill,
                    duration: duration,
                    bossPercentage: f.kill ? 0 : f.fightPercentage,
                    deathsCount: f.kill ? 1 : 5,
                    averageDps: 850000,
                    averageHps: 600000,
                    players: []
                  });
                }
              } catch (err) {
                console.error(`[WCL API] Error fetching fight ${f.id} tables:`, err);
                mappedFights.push({
                  id: f.id,
                  name: f.name,
                  difficulty: difficultyName,
                  kill: f.kill,
                  duration: duration,
                  bossPercentage: f.kill ? 0 : f.fightPercentage,
                  deathsCount: f.kill ? 1 : 5,
                  averageDps: 850000,
                  averageHps: 600000,
                  players: []
                });
              }
            })
          );

          // Maintain chronological order
          mappedFights.sort((a, b) => a.id - b.id);

          return this.aggregateReport(
            apiReport.title || 'Raid ' + event.title,
            apiReport.zone?.name || 'Nerub\'ar Palace',
            apiReport.owner?.name || 'Guild Officer',
            mappedFights
          );
        }
      } catch (err) {
        console.error('[WCL API] Failed to fetch real metrics:', err instanceof Error ? err.message : err);
      }
    }

    return null;
  }

  /**
   * Helper to aggregate all fight metrics into the final high-level report
   */
  private static aggregateReport(title: string, zone: string, owner: string, fights: WclFight[]): WclReportMetrics {
    const totalDuration = fights.reduce((acc, f) => acc + f.duration, 0);
    const totalKills = fights.filter(f => f.kill).length;
    const totalWipes = fights.filter(f => !f.kill).length;

    // Summing global damage/healing
    let totalDamage = 0;
    let totalHealing = 0;
    let sumDps = 0;
    let sumHps = 0;

    fights.forEach(f => {
      sumDps += f.averageDps;
      sumHps += f.averageHps;
      f.players.forEach(p => {
        totalDamage += p.dps * f.duration;
        totalHealing += p.hps * f.duration;
      });
    });

    const raidAvgDps = fights.length > 0 ? Math.round(sumDps / fights.length) : 0;
    const raidAvgHps = fights.length > 0 ? Math.round(sumHps / fights.length) : 0;

    // Find most deadly boss (wipe count + deathsCount)
    const bossDeaths: Record<string, number> = {};
    fights.forEach(f => {
      bossDeaths[f.name] = (bossDeaths[f.name] || 0) + f.deathsCount + (f.kill ? 0 : 10);
    });
    let mostDeadlyBoss = 'None';
    let maxDeaths = -1;
    for (const [name, score] of Object.entries(bossDeaths)) {
      if (score > maxDeaths) {
        maxDeaths = score;
        mostDeadlyBoss = name;
      }
    }

    // Find MVP Player and construct Leaderboard using the relative scoring system
    interface PlayerScoreStats {
      name: string;
      class: string;
      role: 'tank' | 'heal' | 'dps';
      dpsSum: number;
      hpsSum: number;
      damageTakenSum: number;
      deathsSum: number;
      fightsCount: number;
      dpsAvg: number;
      hpsAvg: number;
      avoidableDeaths: number;
      dpsPoints: number;
      hpsPoints: number;
      damageTakenMalus: number;
      deathMalus: number;
      totalScore: number;
    }

    const playerScoresMap: Record<string, PlayerScoreStats> = {};

    fights.forEach(f => {
      f.players.forEach(p => {
        if (!playerScoresMap[p.name]) {
          playerScoresMap[p.name] = {
            name: p.name,
            class: p.class,
            role: p.role,
            dpsSum: 0,
            hpsSum: 0,
            damageTakenSum: 0,
            deathsSum: 0,
            fightsCount: 0,
            dpsAvg: 0,
            hpsAvg: 0,
            avoidableDeaths: 0,
            dpsPoints: 0,
            hpsPoints: 0,
            damageTakenMalus: 0,
            deathMalus: 0,
            totalScore: 0
          };
        }
        // Keep track of the role. If they ever play 'tank' or 'heal', prioritize those over 'dps'
        if (p.role !== 'dps') {
          playerScoresMap[p.name].role = p.role;
        }
        playerScoresMap[p.name].dpsSum += p.dps;
        playerScoresMap[p.name].hpsSum += p.hps;
        playerScoresMap[p.name].damageTakenSum += (p.damageTaken || 0);
        playerScoresMap[p.name].deathsSum += p.deaths;
        playerScoresMap[p.name].fightsCount += 1;
      });
    });

    const playersList = Object.values(playerScoresMap);

    // Calculate averages and avoidable deaths using the formula: max(0, totalDeaths - totalWipes)
    playersList.forEach(p => {
      const fc = p.fightsCount || 1;
      p.dpsAvg = p.dpsSum / fc;
      p.hpsAvg = p.hpsSum / fc;
      p.avoidableDeaths = Math.max(0, p.deathsSum - totalWipes);
    });

    // 1. Dégâts infligés (DPS) - 200 pts for 1st, -10 pts per rank below, +20 pts for tanks
    const sortedByDps = [...playersList].sort((a, b) => b.dpsSum - a.dpsSum);
    sortedByDps.forEach((p, index) => {
      let points = Math.max(0, 200 - index * 10);
      if (p.role === 'tank') {
        points += 20;
      }
      p.dpsPoints = points;
    });

    // 2. Soins (HPS) - Separate scales for Healers/Tanks and DPS players
    // Healers & Tanks : start at 200 pts, decrease by 10 pts per rank
    const healersAndTanks = playersList.filter(p => p.role !== 'dps');
    const sortedHealersAndTanks = [...healersAndTanks].sort((a, b) => b.hpsSum - a.hpsSum);
    sortedHealersAndTanks.forEach((p, index) => {
      let points = Math.max(0, 200 - index * 10);
      if (p.role === 'tank') {
        points += 10;
      }
      p.hpsPoints = points;
    });

    // DPS : start at 100 pts (malus of 100), decrease by 3 pts per rank
    const dpsPlayers = playersList.filter(p => p.role === 'dps');
    const sortedDps = [...dpsPlayers].sort((a, b) => b.hpsSum - a.hpsSum);
    sortedDps.forEach((p, index) => {
      p.hpsPoints = Math.max(0, 100 - index * 3);
    });

    // 3. Morts - Malus of 20 points per avoidable death
    playersList.forEach(p => {
      p.deathMalus = - (p.avoidableDeaths * 20);
    });

    // 4. Dégâts subis (Damage taken) - Malus for non-tanks.
    // Highest damage taken gets -20 points, decreasing by 2 points per player (caps at 0)
    const nonTanks = playersList.filter(p => p.role !== 'tank');
    const sortedByDamage = [...nonTanks].sort((a, b) => b.damageTakenSum - a.damageTakenSum);
    sortedByDamage.forEach((p, index) => {
      const malus = Math.max(0, 20 - index * 2);
      p.damageTakenMalus = -malus;
    });

    // Compute total score
    playersList.forEach(p => {
      let score = p.dpsPoints + p.hpsPoints + p.deathMalus + p.damageTakenMalus;
      if (p.role === 'tank') {
        score -= 50; // Apply standard tank malus of 50 points
      }
      p.totalScore = score;
    });

    let mvpName = 'Thrall';
    let mvpClass = 'shaman';
    let maxScore = -999999;
    playersList.forEach(p => {
      if (p.totalScore > maxScore) {
        maxScore = p.totalScore;
        mvpName = p.name;
        mvpClass = p.class;
      }
    });

    const mvpLeaderboard: WclMvpEntry[] = playersList.map(p => {
      return {
        name: p.name,
        class: p.class,
        score: Math.round(p.totalScore),
        dpsTotal: Math.round(p.dpsSum),
        hpsTotal: Math.round(p.hpsSum),
        deathsCount: p.avoidableDeaths,
        damageTakenSum: p.damageTakenSum
      };
    }).sort((a, b) => b.score - a.score);

    // Calculate player total deaths across all fights
    const playerDeaths: Record<string, { class: string; deaths: number }> = {};
    fights.forEach(f => {
      f.players.forEach(p => {
        if (!playerDeaths[p.name]) {
          playerDeaths[p.name] = { class: p.class, deaths: 0 };
        }
        playerDeaths[p.name].deaths += p.deaths;
      });
    });

    let mostDiedName = '';
    let mostDiedClass = '';
    let maxPlayerDeaths = -1;

    let leastDiedName = '';
    let leastDiedClass = '';
    let minPlayerDeaths = 999999;

    for (const [name, info] of Object.entries(playerDeaths)) {
      if (info.deaths > maxPlayerDeaths) {
        maxPlayerDeaths = info.deaths;
        mostDiedName = name;
        mostDiedClass = info.class;
      }
      if (info.deaths < minPlayerDeaths) {
        minPlayerDeaths = info.deaths;
        leastDiedName = name;
        leastDiedClass = info.class;
      }
    }

    const mostDiedPlayer = mostDiedName ? { name: mostDiedName, class: mostDiedClass, deaths: maxPlayerDeaths } : null;
    const leastDiedPlayer = leastDiedName ? { name: leastDiedName, class: leastDiedClass, deaths: minPlayerDeaths } : null;

    // Calculate survival and active time averages
    let totalPlayerFights = 0;
    let totalDeaths = 0;
    let totalActiveTimeSum = 0;
    let activeTimeCount = 0;

    fights.forEach(f => {
      totalPlayerFights += f.players.length;
      f.players.forEach(p => {
        totalDeaths += p.deaths;
        totalActiveTimeSum += p.activeTime;
        activeTimeCount++;
      });
    });

    const avgSurvivalRate = totalPlayerFights > 0 ? Math.round((1 - (totalDeaths / totalPlayerFights)) * 100) : 100;
    const avgActiveTime = activeTimeCount > 0 ? Math.round(totalActiveTimeSum / activeTimeCount) : 100;

    return {
      title,
      zone,
      owner,
      totalDuration,
      totalKills,
      totalWipes,
      totalDamage,
      totalHealing,
      raidAvgDps,
      raidAvgHps,
      totalDeaths,
      avgActiveTime,
      mostDeadlyBoss,
      mvpPlayer: { name: mvpName, class: mvpClass, score: Math.round(maxScore) },
      mostDiedPlayer,
      leastDiedPlayer,
      mvpLeaderboard,
      fights
    };
  }

  static async getCharacterParses(
    name: string,
    realmSlug: string,
    region: string,
    characterClass?: string,
    difficulty?: number
  ): Promise<any> {
    const token = await this.getAccessToken();
    if (!token) {
      console.warn('[WCL API] No access token or invalid credentials. Generating mock parses.');
      return generateMockParses(name, characterClass || 'Unknown');
    }

    try {
      const query = `
        query ($name: String!, $serverSlug: String!, $serverRegion: String!, $difficulty: Int) {
          characterData {
            character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
              id
              name
              classID
              raidRankings: zoneRankings(zoneID: 46, difficulty: $difficulty)
              sporefallRankings: zoneRankings(zoneID: 50, difficulty: $difficulty)
              dungeonRankings: zoneRankings(zoneID: 47, metric: points_and_damage)
            }
          }
        }
      `;

      const response = await axios.post(
        'https://www.warcraftlogs.com/api/v2/client',
        { query, variables: { name, serverSlug: realmSlug, serverRegion: region.toLowerCase(), difficulty: difficulty || null } },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000
        }
      );

      if (response.data.errors) {
        console.warn('[WCL API] GraphQL Errors:', response.data.errors);
        return generateMockParses(name, characterClass || 'Unknown');
      }

      const character = response.data?.data?.characterData?.character;
      if (!character) {
        console.warn(`[WCL API] Character not found: ${name}-${realmSlug} in ${region}. Generating mock parses.`);
        return generateMockParses(name, characterClass || 'Unknown');
      }

      const raidData = character.raidRankings || { bestPerformanceAverage: 0, medianPerformanceAverage: 0, rankings: [] };
      const sporefallData = character.sporefallRankings || { bestPerformanceAverage: 0, medianPerformanceAverage: 0, rankings: [] };
      const dungeonData = character.dungeonRankings || { bestPerformanceAverage: 0, medianPerformanceAverage: 0, rankings: [], throughputRankings: {} };

      const formatRankings = (wclRankings: any[], defaultDiff: number, throughputRankings?: any) => {
        return (wclRankings || []).map((r: any) => {
          const encId = r.encounter?.id || 0;
          let percentile = r.rankPercent !== undefined && r.rankPercent !== null ? Math.round(r.rankPercent) : null;
          let keyLevel = r.bestRank?.ilvl || null;
          let amount = r.bestAmount !== undefined && r.bestAmount !== null ? Math.round(r.bestAmount) : 0;

          if (throughputRankings && throughputRankings[encId.toString()]) {
            const tr = throughputRankings[encId.toString()];
            if (tr.best_historical_percentile !== undefined && tr.best_historical_percentile !== null) {
              percentile = Math.round(tr.best_historical_percentile);
            }
            if (tr.best_level) {
              keyLevel = tr.best_level;
            }
            if (tr.best_per_second_amount) {
              amount = Math.round(tr.best_per_second_amount);
            }
          }

          return {
            encounterId: encId,
            encounterName: r.encounter?.name || 'Unknown',
            percentile,
            rank: r.allStars?.rank || 0,
            spec: r.spec || 'Unknown',
            amount,
            difficulty: r.difficulty || defaultDiff,
            keyLevel
          };
        });
      };

      const formattedRaid = [
        ...formatRankings(raidData.rankings, raidData.difficulty || 5),
        ...formatRankings(sporefallData.rankings, sporefallData.difficulty || 5)
      ];
      const formattedDungeons = formatRankings(dungeonData.rankings, 10, dungeonData.throughputRankings);

      let bestRaidAvg = Math.round(raidData.bestPerformanceAverage || 0);
      let bestDungeonAvg = Math.round(dungeonData.bestPerformanceAverage || 0);

      // Re-calculate the raid average based on the merged list (Zone 46 + Zone 50)
      if (formattedRaid.length > 0) {
        const validRaid = formattedRaid.filter(r => r.percentile !== null && r.percentile !== undefined);
        if (validRaid.length > 0) {
          bestRaidAvg = Math.round(validRaid.reduce((sum, r) => sum + (r.percentile || 0), 0) / validRaid.length);
        }
      }

      // Re-calculate the dungeons average based on the specific historical DPS parses
      if (formattedDungeons.length > 0) {
        const validDung = formattedDungeons.filter(d => d.percentile !== null && d.percentile !== undefined);
        if (validDung.length > 0) {
          bestDungeonAvg = Math.round(validDung.reduce((sum, d) => sum + (d.percentile || 0), 0) / validDung.length);
        }
      }

      return {
        characterName: character.name,
        characterClass: characterClass || 'Unknown',
        raidRankings: {
          bestPerformanceAverage: bestRaidAvg,
          medianPerformanceAverage: Math.round(raidData.medianPerformanceAverage || 0),
          difficulty: raidData.difficulty || 5,
          rankings: formattedRaid
        },
        dungeonRankings: {
          bestPerformanceAverage: bestDungeonAvg,
          medianPerformanceAverage: Math.round(dungeonData.medianPerformanceAverage || 0),
          difficulty: 10,
          rankings: formattedDungeons
        },
        isMock: false
      };
    } catch (err) {
      console.error('[WCL API] Error fetching character parses, generating mock parses instead:', err instanceof Error ? err.message : err);
      return generateMockParses(name, characterClass || 'Unknown');
    }
  }
}

function normalizeClass(cls: string): string {
  if (!cls) return 'mage';
  const name = cls.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'guerrier': 'warrior',
    'warrior': 'warrior',
    'paladin': 'paladin',
    'chasseur': 'hunter',
    'hunter': 'hunter',
    'voleur': 'rogue',
    'rogue': 'rogue',
    'prêtre': 'priest',
    'priest': 'priest',
    'chevalier de la mort': 'deathknight',
    'death knight': 'deathknight',
    'deathknight': 'deathknight',
    'dk': 'deathknight',
    'chaman': 'shaman',
    'shaman': 'shaman',
    'mage': 'mage',
    'démoniste': 'warlock',
    'warlock': 'warlock',
    'moine': 'monk',
    'monk': 'monk',
    'druide': 'druid',
    'druid': 'druid',
    'drood': 'druid',
    'chasseur de démons': 'demonhunter',
    'demon hunter': 'demonhunter',
    'demonhunter': 'demonhunter',
    'dh': 'demonhunter',
    'évocateur': 'evoker',
    'evoker': 'evoker'
  };
  return mapping[name] || name.replace(/\s+/g, '');
}

const CLASS_SPECS: Record<string, string[]> = {
  'warrior': ['Arms', 'Fury', 'Protection'],
  'paladin': ['Holy', 'Protection', 'Retribution'],
  'hunter': ['Beast Mastery', 'Marksmanship', 'Survival'],
  'rogue': ['Assassination', 'Outlaw', 'Subtlety'],
  'priest': ['Discipline', 'Holy', 'Shadow'],
  'deathknight': ['Blood', 'Frost', 'Unholy'],
  'shaman': ['Elemental', 'Enhancement', 'Restoration'],
  'mage': ['Arcane', 'Fire', 'Frost'],
  'warlock': ['Affliction', 'Demonology', 'Destruction'],
  'monk': ['Brewmaster', 'Mistweaver', 'Windwalker'],
  'druid': ['Balance', 'Feral', 'Guardian', 'Restoration'],
  'demonhunter': ['Havoc', 'Vengeance'],
  'evoker': ['Devastation', 'Preservation', 'Augmentation']
};

function generateMockParses(name: string, characterClass: string) {
  const normClass = normalizeClass(characterClass);
  const specs = CLASS_SPECS[normClass] || ['Damage'];
  const spec = specs[Math.floor(Math.random() * specs.length)] || 'Damage';

  const getHashValue = (str: string, seed: number) => {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  const raidEncounters = [
    { id: 5011, name: "Imperator Averzian" },
    { id: 5012, name: "Vorasius" },
    { id: 5013, name: "Fallen-King Salhadaar" },
    { id: 5014, name: "Vaelgor & Ezzorak" },
    { id: 5015, name: "Lightblinded Vanguard" },
    { id: 5016, name: "Crown of the Cosmos" },
    { id: 5017, name: "Chimaerus, the Undreamt God" },
    { id: 5018, name: "Belo'ren, Child of Al'ar" },
    { id: 5019, name: "Midnight Falls" },
    { id: 3159, name: "Rotmire" }
  ];

  const dungeonEncounters = [
    { id: 14021, name: "Harandar Fungal Caves" },
    { id: 14022, name: "Void-Scarred Sanctum" },
    { id: 14023, name: "Ruins of Solanar" },
    { id: 14024, name: "Ethereal Bazaar" },
    { id: 14025, name: "Manaforge Delta" },
    { id: 14026, name: "Sunwell Outpost" },
    { id: 14027, name: "Shadow-Veil Keep" },
    { id: 14028, name: "K'aresh Rift" }
  ];

  const raidRankings = raidEncounters.map((enc, idx) => {
    const seed = idx + 10;
    const hash = getHashValue(name, seed);
    const percentile = Math.floor((hash % 70) + 30); // 30 - 99
    const rank = Math.floor((hash % 1000) + 1);
    const amount = Math.floor((hash % 50000) + 750000);
    return {
      encounterId: enc.id,
      encounterName: enc.name,
      percentile,
      rank,
      spec,
      amount,
      difficulty: 4
    };
  });

  const dungeonRankings = dungeonEncounters.map((enc, idx) => {
    const seed = idx + 50;
    const hash = getHashValue(name, seed);
    const percentile = Math.floor((hash % 65) + 35); // 35 - 99
    const rank = Math.floor((hash % 1500) + 1);
    const amount = Math.floor((hash % 60000) + 850000);
    return {
      encounterId: enc.id,
      encounterName: enc.name,
      percentile,
      rank,
      spec,
      amount,
      difficulty: 10,
      keyLevel: Math.floor((hash % 15) + 4) // mock key levels between 4 and 18
    };
  });

  const sumRaid = raidRankings.reduce((sum, r) => sum + r.percentile, 0);
  const bestRaidAvg = Math.round(sumRaid / raidRankings.length);

  const sumDung = dungeonRankings.reduce((sum, r) => sum + r.percentile, 0);
  const bestDungAvg = Math.round(sumDung / dungeonRankings.length);

  return {
    characterName: name,
    characterClass,
    raidRankings: {
      bestPerformanceAverage: bestRaidAvg,
      medianPerformanceAverage: Math.round(bestRaidAvg * 0.9),
      rankings: raidRankings
    },
    dungeonRankings: {
      bestPerformanceAverage: bestDungAvg,
      medianPerformanceAverage: Math.round(bestDungAvg * 0.9),
      rankings: dungeonRankings
    },
    isMock: true
  };
}
