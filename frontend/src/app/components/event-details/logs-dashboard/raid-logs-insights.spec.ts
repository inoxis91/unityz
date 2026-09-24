import { describe, expect, it } from 'vitest';
import { ReportPlayer } from '../../../services/raid-logs';
import {
  characterKey,
  computeAwards,
  contributions,
  matchMyPlayers,
  potionStatus,
  roleChampions,
} from './raid-logs-insights';

function player(overrides: Partial<ReportPlayer>): ReportPlayer {
  return {
    actorId: 1,
    name: 'Player',
    server: 'Hyjal',
    classId: 'mage',
    spec: 'Frost',
    role: 'dps',
    itemLevel: 320,
    pulls: 10,
    kills: 4,
    avgParse: 50,
    bestParse: 60,
    avgIlvlParse: 50,
    damageDone: 0,
    healingDone: 0,
    dps: 100_000,
    hps: 0,
    deaths: 3,
    prematureDeaths: 1,
    combatPotions: 5,
    potionPulls: 5,
    potionEligiblePulls: 8,
    flaskPulls: 10,
    foodPulls: 10,
    healthstones: 0,
    deathsWithoutHealthstone: 0,
    interrupts: 0,
    dispels: 0,
    score: 50,
    breakdown: { performance: 50, output: 50, survival: 50, preparation: 50, utility: 50 },
    eligible: true,
    rank: 1,
    ...overrides,
  };
}

describe('characterKey', () => {
  it('ignores case, spaces and apostrophes in the realm', () => {
    expect(characterKey('Emoùchet', 'Kirin Tor')).toBe(characterKey('emoùchet', 'KirinTor'));
    expect(characterKey('Sandor', "Mal'Ganis")).toBe(characterKey('Sandor', 'malganis'));
  });
});

describe('matchMyPlayers', () => {
  const players = [
    player({ actorId: 1, name: 'Keew', server: 'Eitrigg' }),
    player({ actorId: 2, name: 'Twin', server: 'Hyjal' }),
    player({ actorId: 3, name: 'Twin', server: 'Archimonde' }),
  ];

  it('matches on name and realm', () => {
    expect([...matchMyPlayers(players, [{ name: 'Twin', realm: 'Archimonde' }])]).toEqual([3]);
  });

  it('falls back to a unique name when the realm differs', () => {
    expect([...matchMyPlayers(players, [{ name: 'keew', realm: 'Other' }])]).toEqual([1]);
  });

  it('does not guess between homonyms', () => {
    expect(matchMyPlayers(players, [{ name: 'Twin', realm: null }]).size).toBe(0);
  });
});

describe('roleChampions', () => {
  it('returns the best eligible player of each role', () => {
    const players = [
      player({ actorId: 1, role: 'dps', rank: 1 }),
      player({ actorId: 2, role: 'tank', rank: 2, eligible: false }),
      player({ actorId: 3, role: 'tank', rank: 3 }),
    ];
    const champions = roleChampions(players);
    expect(champions.dps?.actorId).toBe(1);
    expect(champions.tank?.actorId).toBe(3);
    expect(champions.healer).toBeNull();
  });
});

describe('computeAwards', () => {
  const players = [
    player({ actorId: 1, rank: 1, avgParse: 86, prematureDeaths: 0, deaths: 8, interrupts: 2 }),
    player({ actorId: 2, rank: 2, avgParse: 70, prematureDeaths: 0, deaths: 5, interrupts: 11 }),
    player({ actorId: 3, rank: 3, role: 'healer', hps: 40_000, prematureDeaths: 3, dispels: 28 }),
    player({ actorId: 4, rank: 4, prematureDeaths: 5, deaths: 9, eligible: false }),
  ];
  const awards = new Map(computeAwards(players).map((a) => [a.key, a]));

  it('picks the best parse among eligible players', () => {
    expect(awards.get('best_parse')?.player.actorId).toBe(1);
  });

  it('breaks survivor ties on total deaths', () => {
    expect(awards.get('survivor')?.player.actorId).toBe(2);
  });

  it('counts every player for the most deaths, eligible or not', () => {
    expect(awards.get('most_deaths')?.player.actorId).toBe(4);
    expect(awards.get('most_deaths')?.value).toBe(5);
  });

  it('rewards interrupts and dispels', () => {
    expect(awards.get('interrupts')?.player.actorId).toBe(2);
    expect(awards.get('dispels')?.player.actorId).toBe(3);
    expect(awards.get('top_hps')?.player.actorId).toBe(3);
  });

  it('omits awards without a meaningful winner', () => {
    const quiet = computeAwards([player({ interrupts: 0, dispels: 0, prematureDeaths: 0 })]);
    expect(quiet.map((a) => a.key)).not.toContain('interrupts');
    expect(quiet.map((a) => a.key)).not.toContain('most_deaths');
  });
});

describe('potionStatus', () => {
  it.each([
    [8, 8, 'full'],
    [6, 8, 'partial'],
    [0, 8, 'none'],
    [0, 0, 'na'],
  ])('%s/%s → %s', (potionPulls, potionEligiblePulls, expected) => {
    expect(potionStatus(player({ potionPulls, potionEligiblePulls }))).toBe(expected);
  });
});

describe('contributions', () => {
  it('weights each criterion so that the points add up to the score', () => {
    const parts = contributions(
      { performance: 86, output: 61.1, survival: 100, preparation: 100, utility: 18.2 },
      { performance: 40, output: 20, survival: 20, preparation: 15, utility: 5 },
    );
    const total = parts.reduce((sum, p) => sum + p.points, 0);
    expect(total).toBeCloseTo(82.53, 2);
    expect(parts[0]).toMatchObject({ criterion: 'performance', points: 34.4 });
  });
});
