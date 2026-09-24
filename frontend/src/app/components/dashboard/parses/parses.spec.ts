import { describe, expect, it } from 'vitest';
import { defaultMetric } from './parses';
import {
  displayPercent,
  formatCompact,
  formatDuration,
  parseColorClass,
  topPercent,
} from './parse-tier';
import { Character } from '../../../services/character';

describe('parseColorClass', () => {
  it.each([
    [undefined, 'gray'],
    [null, 'gray'],
    [24.9, 'gray'],
    [25, 'green'],
    [27.17, 'green'],
    [50, 'blue'],
    [75, 'purple'],
    [94.9, 'purple'],
    [95, 'orange'],
    [99, 'pink'],
    [100, 'gold'],
  ])('%s → %s', (percentile, expected) => {
    expect(parseColorClass(percentile)).toBe(expected);
  });
});

describe('displayPercent', () => {
  it('truncates like Warcraft Logs', () => {
    expect(displayPercent(59.77)).toBe(59);
    expect(displayPercent(99.99)).toBe(99);
    expect(displayPercent(null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [359_619, '5:59'],
    [1_630_218, '27:10'],
    [3_723_000, '1:02:03'],
    [null, '—'],
    [0, '—'],
  ])('%s → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatCompact', () => {
  it('uses compact notation', () => {
    expect(formatCompact(280_588, 'en')).toBe('280.6K');
    expect(formatCompact(null, 'en')).toBe('—');
  });
});

describe('topPercent', () => {
  it('computes the share of ranked players above', () => {
    expect(topPercent(9136, 194_619)).toBeCloseTo(4.69, 2);
    expect(topPercent(0, 100)).toBeNull();
  });
});

describe('defaultMetric', () => {
  const base: Character = { name: 'X', realm: 'Y', class: 'Prêtre', level: 90 };

  it('uses healing for a healer-only character', () => {
    expect(defaultMetric({ ...base, is_heal: true })).toBe('hps');
  });

  it('uses damage otherwise', () => {
    expect(defaultMetric({ ...base, is_heal: true, is_dps: true })).toBe('dps');
    expect(defaultMetric({ ...base, is_tank: true })).toBe('dps');
    expect(defaultMetric(undefined)).toBe('dps');
  });
});
