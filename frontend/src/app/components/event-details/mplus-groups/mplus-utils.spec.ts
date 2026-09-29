import { describe, it, expect } from 'vitest';
import { Signup } from '../../../services/calendar';
import {
  autoFill,
  buildGroup,
  buildSlots,
  formatForDiscord,
  possibleGroups,
  rioTier,
  ScoreFn,
} from './mplus-utils';

function player(
  user_id: string,
  role: string,
  character_class = 'Guerrier',
  status = 'signed_up',
): Signup {
  return {
    id: `s-${user_id}`,
    event_id: 'event-1',
    user_id,
    character_id: null,
    role,
    status,
    group_index: 0,
    comment: null,
    created_at: '',
    updated_at: '',
    character_name: user_id,
    character_class,
    character_realm: 'Hyjal',
  };
}

const scores: Record<string, number> = {};
const scoreOf: ScoreFn = (s) => scores[s.user_id] ?? null;

describe('mplus-utils', () => {
  it('maps M+ scores to colour tiers', () => {
    expect(rioTier(null)).toBe('none');
    expect(rioTier(0)).toBe('none');
    expect(rioTier(1200)).toBe('gray');
    expect(rioTier(1500)).toBe('green');
    expect(rioTier(2400)).toBe('blue');
    expect(rioTier(2999)).toBe('purple');
    expect(rioTier(3000)).toBe('orange');
  });

  it('fills the 1 tank / 1 heal / 3 DPS slots and flags off-role players', () => {
    const slots = buildSlots([player('t1', 'tank'), player('t2', 'tank'), player('d1', 'dps')]);

    expect(slots.map((s) => [s.role, s.signup?.user_id ?? null, s.offRole])).toEqual([
      ['tank', 't1', false],
      ['heal', 't2', true],
      ['dps', 'd1', false],
      ['dps', null, false],
      ['dps', null, false],
    ]);
  });

  it('summarises a group: completeness, average score, bloodlust and battle res', () => {
    Object.assign(scores, { t: 3000, h: 2000 });
    const group = buildGroup(
      1,
      [
        player('t', 'tank', 'Chevalier de la mort'),
        player('h', 'heal', 'Chaman'),
        player('d1', 'dps'),
        player('d2', 'dps'),
        player('d3', 'dps'),
      ],
      scoreOf,
    );

    expect(group.isComplete).toBe(true);
    expect(group.isFull).toBe(true);
    expect(group.avgScore).toBe(2500); // les joueurs sans score sont ignorés
    expect(group.hasLust).toBe(true);
    expect(group.hasBrez).toBe(true);
  });

  it('counts the full groups the remaining players can form', () => {
    const pool = [
      player('t1', 'tank'),
      player('t2', 'tank'),
      player('h1', 'heal'),
      ...['a', 'b', 'c', 'd'].map((id) => player(id, 'dps')),
    ];
    expect(possibleGroups(pool)).toBe(1);
  });

  /** Applique le remplissage et renvoie les groupes obtenus. */
  function fill(groups: Signup[][], pool: Signup[]) {
    const built = groups.map((members, i) => buildGroup(i + 1, members, scoreOf));
    const assignments = autoFill(built, pool, scoreOf);
    const result = groups.map((members) => [...members]);
    for (const a of assignments) {
      result[a.group_index - 1].push(pool.find((p) => p.user_id === a.user_id)!);
    }
    return {
      assignments,
      groups: result.map((members, i) => buildGroup(i + 1, members, scoreOf)),
      ids: result.map((members) => members.map((m) => m.user_id).sort()),
    };
  }

  it('only fills the groups the pool can complete, most advanced first', () => {
    const { ids, assignments } = fill(
      [[], [player('t0', 'tank')]],
      [
        player('t1', 'tank'),
        player('h1', 'heal'),
        ...['a', 'b', 'c'].map((id) => player(id, 'dps')),
      ],
    );

    expect(ids).toEqual([[], ['a', 'b', 'c', 'h1', 't0']]);
    expect(assignments).toHaveLength(4); // t1 reste sans groupe
  });

  it('gives every group a bloodlust and a battle res when the pool allows it', () => {
    Object.assign(scores, { lA: 3000, lB: 2900, bA: 1000, bB: 900 });
    const { groups } = fill(
      [[], []],
      [
        player('t1', 'tank', 'Moine'),
        player('t2', 'tank', 'Guerrier'),
        player('h1', 'heal', 'Prêtre'),
        player('h2', 'heal', 'Prêtre'),
        player('lA', 'dps', 'Mage'),
        player('lB', 'dps', 'Chasseur'),
        player('bA', 'dps', 'Démoniste'),
        player('bB', 'dps', 'Druide'),
        player('r1', 'dps', 'Voleur'),
        player('r2', 'dps', 'Voleur'),
      ],
    );

    expect(groups.map((g) => [g.isComplete, g.hasLust, g.hasBrez])).toEqual([
      [true, true, true],
      [true, true, true],
    ]);
  });

  it('spreads buffs and classes before balancing scores', () => {
    Object.assign(scores, { w1: 3000, w2: 2900, m1: 1000, m2: 900 });
    const { groups } = fill(
      [[], []],
      [
        player('t1', 'tank', 'Paladin'),
        player('t2', 'tank', 'Druide'),
        player('h1', 'heal', 'Chaman'),
        player('h2', 'heal', 'Évocateur'),
        player('w1', 'dps', 'Guerrier'),
        player('w2', 'dps', 'Guerrier'),
        player('m1', 'dps', 'Mage'),
        player('m2', 'dps', 'Mage'),
        player('r1', 'dps', 'Voleur'),
        player('r2', 'dps', 'Voleur'),
      ],
    );

    for (const g of groups) {
      expect(new Set(g.members.map((m) => m.character_class)).size).toBe(5);
    }
  });

  it('picks utility over score when there are more players than slots', () => {
    Object.assign(scores, { v1: 3000, v2: 2900, g1: 2800, mage: 1000, lock: 900 });
    const { ids } = fill(
      [[player('t', 'tank', 'Guerrier'), player('h', 'heal', 'Prêtre')]],
      [
        player('v1', 'dps', 'Voleur'),
        player('v2', 'dps', 'Voleur'),
        player('g1', 'dps', 'Guerrier'),
        player('mage', 'dps', 'Mage'),
        player('lock', 'dps', 'Démoniste'),
      ],
    );

    expect(ids[0]).toEqual(['h', 'lock', 'mage', 't', 'v1']);
  });

  it('keeps standbys for last, even when they bring a bloodlust', () => {
    Object.assign(scores, { sub: 3000 });
    const { ids } = fill(
      [[player('t', 'tank'), player('d1', 'dps'), player('d2', 'dps'), player('d3', 'dps')]],
      [player('main', 'heal', 'Prêtre'), player('sub', 'heal', 'Chaman', 'standby')],
    );

    expect(ids[0]).toContain('main');
  });

  it('balances group averages once utility and classes are settled', () => {
    Object.assign(scores, { tHi: 3000, tLo: 1000, hHi: 3000, hLo: 1000 });
    const { ids } = fill(
      [[], []],
      [
        player('tHi', 'tank', 'Paladin'),
        player('tLo', 'tank', 'Paladin'),
        player('hHi', 'heal', 'Chaman'),
        player('hLo', 'heal', 'Chaman'),
        ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id, 'dps', 'Guerrier')),
      ],
    );

    // Le meilleur tank est associé au heal le plus faible
    expect(ids.find((g) => g.includes('tHi'))).toContain('hLo');
  });

  it('never overfills a group nor places a second tank', () => {
    const full = buildGroup(
      1,
      [player('t', 'tank'), player('h', 'heal'), player('a', 'dps'), player('b', 'dps')],
      scoreOf,
    );
    const pool = [player('t2', 'tank'), player('c', 'dps'), player('d', 'dps')];

    expect(autoFill([full], pool, scoreOf)).toEqual([{ user_id: 'c', group_index: 1 }]);
  });

  it('formats the setup for Discord with empty slots as dashes', () => {
    const group = buildGroup(1, [player('Arthas', 'tank'), player('Jaina', 'dps')], () => null);
    const text = formatForDiscord('Soirée M+', [group], {
      group: (i) => `Groupe ${i}`,
      average: 'moy.',
    });

    expect(text).toBe(
      ['**Soirée M+**', '', '**Groupe 1**', '🛡️ Arthas  ·  💚 —  ·  ⚔️ Jaina, —, —'].join('\n'),
    );
  });
});
