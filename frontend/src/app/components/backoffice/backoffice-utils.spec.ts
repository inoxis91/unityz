import { describe, expect, it } from 'vitest';
import {
  biggestDropOff,
  bucketSeries,
  daysLeft,
  delta,
  formatBytes,
  formatCents,
  formatDay,
  formatDuration,
  formatPercent,
  funnelRows,
  groupTimeline,
  heatLevel,
  niceMax,
  relativeDay,
  relativeTime,
} from './backoffice-utils';

describe('backoffice-utils', () => {
  describe('formatCents', () => {
    it('drops the decimals of round amounts only', () => {
      expect(formatCents(49900, 'en-US')).toBe('€499');
      expect(formatCents(499, 'en-US')).toBe('€4.99');
    });
  });

  describe('formatPercent', () => {
    it('keeps one decimal under 10 % and a dash without data', () => {
      expect(formatPercent(0.042, 'en-US')).toBe('4.2%');
      expect(formatPercent(0.5, 'en-US')).toBe('50%');
      expect(formatPercent(null, 'en-US')).toBe('—');
    });
  });

  it('formatBytes picks the unit', () => {
    expect(formatBytes(512, 'en-US')).toBe('512 B');
    expect(formatBytes(5 * 1024 * 1024, 'en-US')).toBe('5 MB');
  });

  describe('delta', () => {
    it('compares with the previous period', () => {
      expect(delta(15, 10)).toEqual({ ratio: 0.5, direction: 'up' });
      expect(delta(5, 10)).toEqual({ ratio: -0.5, direction: 'down' });
      expect(delta(0, 0)).toEqual({ ratio: null, direction: 'flat' });
    });

    it('has no ratio when the previous period was empty', () => {
      expect(delta(3, 0)).toEqual({ ratio: null, direction: 'up' });
    });
  });

  describe('funnelRows', () => {
    it('computes the share of the top and the step conversion', () => {
      const rows = funnelRows([
        { key: 'a', reached: 100, stopped: 40 },
        { key: 'b', reached: 60, stopped: 45 },
        { key: 'c', reached: 15, stopped: 15 },
      ]);
      expect(rows.map((r) => r.ofTotal)).toEqual([1, 0.6, 0.15]);
      expect(rows.map((r) => r.fromPrevious)).toEqual([null, 0.6, 0.25]);
      expect(biggestDropOff(rows)).toBe('b');
    });

    it('deduces the drop-off when the API only gives the reached count', () => {
      const rows = funnelRows([
        { key: 'a', reached: 10 },
        { key: 'b', reached: 4 },
      ]);
      expect(rows.map((r) => r.stopped)).toEqual([6, 0]);
    });

    it('handles an empty funnel', () => {
      const rows = funnelRows([{ key: 'a', reached: 0, stopped: 0 }]);
      expect(rows[0].ofTotal).toBe(0);
      expect(biggestDropOff(rows)).toBeNull();
    });
  });

  describe('bucketSeries', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-01-${String(i + 1).padStart(2, '0')}`,
      n: i + 1,
    }));

    it('keeps daily points under the limit', () => {
      expect(bucketSeries(days, 'n')).toHaveLength(14);
    });

    it('groups by week above the limit', () => {
      const weeks = bucketSeries(days, 'n', 10);
      expect(weeks).toEqual([
        { day: '2026-01-01', until: '2026-01-07', value: 28 },
        { day: '2026-01-08', until: '2026-01-14', value: 77 },
      ]);
    });
  });

  it('niceMax rounds up to a readable scale', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(230)).toBe(250);
  });

  it('formatDay ignores the time zone', () => {
    expect(formatDay('2026-03-01', 'en-US', { month: 'short', day: 'numeric' })).toBe('Mar 1');
  });

  it('relativeTime picks the largest unit', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    expect(relativeTime('2026-09-26T09:00:00Z', 'en', now)).toBe('3 hours ago');
    expect(relativeTime('2026-09-29T12:00:00Z', 'en', now)).toBe('in 3 days');
  });

  it('formatDuration keeps the largest whole unit', () => {
    expect(formatDuration(42, 'en')).toBe('42 sec');
    expect(formatDuration(150, 'en')).toBe('2 min');
    expect(formatDuration(5 * 3600 + 10, 'en')).toBe('5 hr');
    expect(formatDuration(3 * 86400, 'en')).toBe('3 days');
  });

  it('relativeDay counts calendar days', () => {
    const now = new Date(2026, 8, 26, 23, 30);
    expect(relativeDay('2026-09-26', 'en', now)).toBe('today');
    expect(relativeDay('2026-09-25', 'en', now)).toBe('yesterday');
    expect(relativeDay('2026-09-20', 'en', now)).toBe('6 days ago');
    expect(relativeDay('2026-05-01', 'en', now)).toBe('5 months ago');
  });

  it('daysLeft rounds up and is negative once expired', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    expect(daysLeft('2026-09-28T00:00:00Z', now)).toBe(2);
    expect(daysLeft('2026-09-20T00:00:00Z', now)).toBe(-6);
    expect(daysLeft(null, now)).toBeNull();
  });

  it('heatLevel clamps to [0, 1]', () => {
    expect(heatLevel(null)).toBe(0);
    expect(heatLevel(1.4)).toBe(1);
    expect(heatLevel(0.3)).toBe(0.3);
  });

  it('groupTimeline merges consecutive identical entries but keeps comments apart', () => {
    const item = (type: string, data: Record<string, unknown> = {}) => ({
      kind: 'event' as const,
      type,
      at: '2026-09-26T10:00:00Z',
      battletag: 'Gm#1',
      data,
    });
    const groups = groupTimeline([
      item('guild_selected'),
      item('guild_selected'),
      item('payment_viewed'),
      item('guild_selected'),
      { ...item('payment_exit', { comment: 'cher' }), kind: 'feedback' as const },
      { ...item('payment_exit', { comment: 'cher' }), kind: 'feedback' as const },
    ]);
    expect(groups.map((g) => [g.type, g.count])).toEqual([
      ['guild_selected', 2],
      ['payment_viewed', 1],
      ['guild_selected', 1],
      ['payment_exit', 1],
      ['payment_exit', 1],
    ]);
  });
});
