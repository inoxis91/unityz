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

function player(user_id: string, role: string, character_class = 'Guerrier'): Signup {
  return {
    id: `s-${user_id}`,
    event_id: 'event-1',
    user_id,
    character_id: null,
    role,
    status: 'signed_up',
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

  it('auto-fills free slots by role, strongest players to the weakest groups', () => {
    Object.assign(scores, { tA: 3000, tB: 2000, hA: 2800, hB: 2600, dA: 2500, dB: 2400, dC: 2300 });
    const groups = [buildGroup(1, [], scoreOf), buildGroup(2, [], scoreOf)];
    const pool = ['tA', 'tB', 'hA', 'hB', 'dA', 'dB', 'dC'].map((id) =>
      player(id, id.startsWith('t') ? 'tank' : id.startsWith('h') ? 'heal' : 'dps'),
    );

    const result = Object.fromEntries(
      autoFill(groups, pool, scoreOf).map((a) => [a.user_id, a.group_index]),
    );

    // tA → G1, tB → G2 ; le meilleur heal rejoint le groupe le plus faible (G2)
    expect(result).toMatchObject({ tA: 1, tB: 2, hA: 2, hB: 1 });
    expect(Object.keys(result)).toHaveLength(7);
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
