import { CalendarEvent } from '../../services/calendar';
import {
  buildFeeSummary,
  formatCountdown,
  pickCharacterImage,
  pickUpcomingEvents,
} from './dashboard-utils';

const alloc = (month_date: string, amount: number) => ({
  id: month_date,
  user_id: 'u',
  month_date,
  amount,
});

const event = (
  id: string,
  start_time: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  title: id,
  description: '',
  start_time,
  end_time: start_time,
  type: 'Raid',
  ...extra,
});

describe('dashboard-utils', () => {
  describe('buildFeeSummary', () => {
    const now = new Date(2026, 8, 15); // septembre 2026

    it('classe chaque mois selon le minimum', () => {
      const months = buildFeeSummary(
        [alloc('2026-09-01', 2000), alloc('2026-10-01', 500), alloc('2026-11-01', 3000)],
        2000,
        now,
        'fr-FR',
      );
      expect(months.map((m) => m.state)).toEqual(['paid', 'partial', 'donation']);
      expect(months.map((m) => m.progress)).toEqual([100, 25, 100]);
      expect(months[0].name).toBe('Septembre');
    });

    it('additionne plusieurs dépôts du même mois', () => {
      const [month] = buildFeeSummary(
        [alloc('2026-09-01', 1000), alloc('2026-09-01T00:00:00Z', 1000)],
        2000,
        now,
        'fr-FR',
        1,
      );
      expect(month.amount).toBe(2000);
      expect(month.state).toBe('paid');
    });

    it("déborde sur l'année suivante", () => {
      const months = buildFeeSummary([], 2000, new Date(2026, 11, 3), 'en-US');
      expect(months.map((m) => m.key)).toEqual(['2026-12', '2027-01', '2027-02']);
      expect(months.every((m) => m.state === 'none')).toBe(true);
    });
  });

  describe('formatCountdown', () => {
    const now = new Date('2026-09-24T10:00:00Z');

    it('affiche jours et heures au-delà de 24 h', () => {
      expect(formatCountdown('2026-09-26T14:30:00Z', now, 'j')).toEqual({
        label: '2j 4h',
        soon: false,
      });
    });

    it('signale un événement dans moins de 24 h', () => {
      expect(formatCountdown('2026-09-24T13:12:00Z', now, 'j')).toEqual({
        label: '3h 12m',
        soon: true,
      });
      expect(formatCountdown('2026-09-24T10:08:00Z', now, 'j').label).toBe('8 min');
    });

    it('renvoie null une fois commencé', () => {
      expect(formatCountdown('2026-09-24T09:00:00Z', now, 'j').label).toBeNull();
    });
  });

  describe('pickUpcomingEvents', () => {
    it('trie, exclut passés et annulés, et limite', () => {
      const now = new Date('2026-09-24T10:00:00Z');
      const result = pickUpcomingEvents(
        [
          event('late', '2026-09-30T20:00:00Z'),
          event('past', '2026-09-20T20:00:00Z'),
          event('canceled', '2026-09-25T20:00:00Z', { is_canceled: true }),
          event('soon', '2026-09-25T20:00:00Z'),
          event('mid', '2026-09-27T20:00:00Z'),
        ],
        now,
        2,
      );
      expect(result.map((e) => e.id)).toEqual(['soon', 'mid']);
    });
  });

  describe('pickCharacterImage', () => {
    it('préfère le rendu principal', () => {
      const details = {
        media: {
          assets: [
            { key: 'avatar', value: 'a.jpg' },
            { key: 'main-raw', value: 'raw.png' },
          ],
        },
      };
      expect(pickCharacterImage(details)).toBe('raw.png');
    });

    it('renvoie null sans média', () => {
      expect(pickCharacterImage(null)).toBeNull();
      expect(pickCharacterImage({ media: { assets: [] } })).toBeNull();
    });
  });
});
