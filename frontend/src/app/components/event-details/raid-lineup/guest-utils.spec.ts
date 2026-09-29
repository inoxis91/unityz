import { describe, expect, it } from 'vitest';
import { EventGuest } from '../../../services/calendar';
import {
  applyGuestChange,
  fitRoleToClass,
  guestToSignup,
  isValidGuestName,
  normalizeGuestName,
} from './guest-utils';

function guest(partial: Partial<EventGuest> = {}): EventGuest {
  return {
    id: 'g1',
    event_id: 'e1',
    name: 'Thrall',
    class: 'Chaman',
    role: 'heal',
    kind: 'pug',
    note: 'Vient de Hyjal',
    selection: 'selected',
    created_at: '2026-09-01T20:00:00Z',
    ...partial,
  };
}

describe('guestToSignup', () => {
  it('maps a guest to a line-up card with a prefixed key', () => {
    const s = guestToSignup(guest());
    expect(s.user_id).toBe('guest:g1');
    expect(s.character_name).toBe('Thrall');
    expect(s.character_class).toBe('Chaman');
    expect(s.role).toBe('heal');
    expect(s.selection).toBe('selected');
    expect(s.assigned_role).toBeNull();
    expect(s.comment).toBe('Vient de Hyjal');
    expect(s.guest?.id).toBe('g1');
  });
});

describe('applyGuestChange', () => {
  const a = guest({ id: 'a' });
  const b = guest({ id: 'b', name: 'Jaina' });

  it('replaces an existing guest in place and appends a new one', () => {
    const updated = { ...a, selection: 'benched' as const };
    const c = guest({ id: 'c' });
    expect(applyGuestChange([a, b], { upsert: [updated, c] })).toEqual([updated, b, c]);
  });

  it('removes guests without mutating the input', () => {
    const list = [a, b];
    expect(applyGuestChange(list, { remove: ['a'] })).toEqual([b]);
    expect(list).toEqual([a, b]);
  });

  it('restores a removed guest on rollback', () => {
    expect(applyGuestChange([b], { upsert: [a] })).toEqual([b, a]);
  });
});

describe('guest name', () => {
  it('collapses and trims whitespace', () => {
    expect(normalizeGuestName('  Anduin   Wrynn ')).toBe('Anduin Wrynn');
  });

  it('accepts names, accents and realm suffixes', () => {
    expect(isValidGuestName('Éowÿn')).toBe(true);
    expect(isValidGuestName('Thrall-Kirin Tor')).toBe(true);
    expect(isValidGuestName("Zul'jin-Hyjal")).toBe(true);
  });

  it('rejects too short, too long, digits and markup', () => {
    expect(isValidGuestName('A')).toBe(false);
    expect(isValidGuestName('a'.repeat(41))).toBe(false);
    expect(isValidGuestName('Thrall42')).toBe(false);
    expect(isValidGuestName('<b>x</b>')).toBe(false);
    expect(isValidGuestName('-Thrall')).toBe(false);
  });
});

describe('fitRoleToClass', () => {
  it('keeps a playable role', () => {
    expect(fitRoleToClass('Druide', 'tank')).toBe('tank');
  });

  it('forces DPS for pure DPS classes', () => {
    expect(fitRoleToClass('Mage', 'heal')).toBe('dps');
    expect(fitRoleToClass('Mage', null)).toBe('dps');
  });

  it('clears an unplayable role for hybrid classes', () => {
    expect(fitRoleToClass('Guerrier', 'heal')).toBeNull();
  });
});
