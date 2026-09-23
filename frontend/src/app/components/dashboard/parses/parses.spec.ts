import { describe, expect, it } from 'vitest';
import { parseColorClass } from './parses';

describe('parseColorClass', () => {
  it.each([
    [undefined, 'gray'],
    [null, 'gray'],
    [12, 'gray'],
    [30, 'green'],
    [50, 'blue'],
    [75, 'purple'],
    [90, 'orange'],
    [99, 'pink'],
    [100, 'pink'],
  ])('%s → %s', (percentile, expected) => {
    expect(parseColorClass(percentile)).toBe(expected);
  });
});
