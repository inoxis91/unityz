import { describe, expect, it } from 'vitest';
import { raiderIoCharacterUrl, toRealmSlug, warcraftLogsCharacterUrl } from './character-utils';

describe('character-utils', () => {
  it('slugifies realm names', () => {
    expect(toRealmSlug('Culte de la Rive noire')).toBe('culte-de-la-rive-noire');
    expect(toRealmSlug("Kel'Thuzad")).toBe('kelthuzad');
  });

  it('builds region-aware profile links', () => {
    expect(raiderIoCharacterUrl('eu', 'Thrall', 'Hyjal')).toBe(
      'https://raider.io/characters/eu/hyjal/thrall',
    );
    expect(raiderIoCharacterUrl('us', 'Thrall', 'Illidan')).toBe(
      'https://raider.io/characters/us/illidan/thrall',
    );
    expect(warcraftLogsCharacterUrl('us', 'Jaïna', 'Area 52')).toBe(
      'https://www.warcraftlogs.com/character/us/area-52/ja%C3%AFna',
    );
  });

  it('returns a dead link when the character is incomplete', () => {
    expect(raiderIoCharacterUrl('eu', undefined, 'Hyjal')).toBe('#');
    expect(warcraftLogsCharacterUrl('us', 'Thrall', undefined)).toBe('#');
  });
});
