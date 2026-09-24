import { GuildCharacterOverview } from '../../services/character';
import {
  classDistribution,
  filterCharacters,
  groupByRole,
  normalize,
} from './guild-characters-utils';

const char = (extra: Partial<GuildCharacterOverview>): GuildCharacterOverview => ({
  id: extra.name ?? 'x',
  name: 'X',
  realm: 'Hyjal',
  class: 'Mage',
  level: 80,
  is_tank: false,
  is_heal: false,
  is_dps: true,
  is_main: true,
  roster_id: null,
  roster_name: null,
  owner_battletag: 'Joe#1234',
  owner_id: 'u1',
  ...extra,
});

const classIdOf = (c: string) => ({ Mage: 'mage', Prêtre: 'priest', Guerrier: 'warrior' })[c] ?? c;
const classLabelOf = (id: string) =>
  ({ mage: 'Mage', priest: 'Prêtre', warrior: 'Guerrier' })[id] ?? id;

describe('guild-characters-utils', () => {
  const chars = [
    char({ name: 'Élune', class: 'Prêtre', is_heal: true, is_dps: false }),
    char({
      name: 'Brak',
      class: 'Guerrier',
      is_tank: true,
      is_dps: true,
      owner_battletag: 'Ana#1',
    }),
    char({ name: 'Zap', is_main: false, roster_name: 'Mythique' }),
  ];

  it('ignore accents et casse', () => {
    expect(normalize('  Élune ')).toBe('elune');
  });

  it('filtre par périmètre, classe et recherche (nom, joueur, roster, classe)', () => {
    const f = (scope: 'mains' | 'alts' | 'all', query = '', classId: string | null = null) =>
      filterCharacters(chars, { scope, query, classId }, classIdOf, classLabelOf).map(
        (c) => c.name,
      );
    expect(f('mains')).toEqual(['Élune', 'Brak']);
    expect(f('alts')).toEqual(['Zap']);
    expect(f('all', 'elune')).toEqual(['Élune']);
    expect(f('all', 'ana')).toEqual(['Brak']);
    expect(f('all', 'mythique')).toEqual(['Zap']);
    expect(f('all', 'pretre')).toEqual(['Élune']);
    expect(f('all', '', 'warrior')).toEqual(['Brak']);
  });

  it('groupe par rôle, mains en premier', () => {
    const cols = groupByRole(chars);
    expect(cols.tank.map((c) => c.name)).toEqual(['Brak']);
    expect(cols.heal.map((c) => c.name)).toEqual(['Élune']);
    expect(cols.dps.map((c) => c.name)).toEqual(['Brak', 'Zap']);
  });

  it('calcule la répartition des classes', () => {
    const dist = classDistribution([...chars, char({ name: 'Frost' })], classIdOf);
    expect(dist[0]).toEqual({ classId: 'mage', count: 2, percent: 50 });
    expect(dist).toHaveLength(3);
  });
});
