import { CalendarEvent } from '../../services/calendar';
import {
  addDays,
  buildAgenda,
  buildEventPayload,
  countEventsInMonth,
  emptyEventForm,
  formFromEvent,
  pasteEventOn,
  toLocalDateStr,
  toggleInvitedGroup,
} from './calendar-utils';

const event = (extra: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  title: 'Raid HM',
  description: 'Vocal 20h15',
  start_time: '2026-09-24T20:30:00',
  end_time: '2026-09-24T22:30:00',
  type: 'raid',
  ...extra,
});

describe('calendar-utils', () => {
  it('formate une date locale sans décalage UTC', () => {
    expect(toLocalDateStr(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  describe('buildEventPayload', () => {
    it('reporte la fin au lendemain quand elle précède le début', () => {
      const payload = buildEventPayload({
        ...emptyEventForm('2026-09-30'),
        title: '  Raid tardif ',
        start_time: '23:00',
        end_time: '01:00',
      });
      expect(payload.title).toBe('Raid tardif');
      expect(payload.start_time).toBe('2026-09-30T23:00:00');
      expect(payload.end_time).toBe('2026-10-01T01:00:00');
    });

    it('utilise le type personnalisé et ignore roster/logs hors raid', () => {
      const payload = buildEventPayload({
        ...emptyEventForm('2026-09-24'),
        type: 'custom',
        customType: 'Farm montures',
        roster_id: 'r1',
        logs: 'abc',
      });
      expect(payload.type).toBe('Farm montures');
      expect(payload.roster_id).toBe('r1');
      expect(payload.logs).toBeNull();
    });

    it("n'envoie les groupes invités que pour une réunion", () => {
      const payload = buildEventPayload({
        ...emptyEventForm('2026-09-24'),
        type: 'reunion',
        roster_id: 'r1',
        invited_groups: ['admin'],
      });
      expect(payload.roster_id).toBeNull();
      expect(payload.invited_groups).toEqual(['admin']);
    });
  });

  it('reconstruit le formulaire depuis un événement personnalisé', () => {
    const form = formFromEvent(event({ type: 'Farm', roster_id: 'r2' }));
    expect(form).toMatchObject({
      type: 'custom',
      customType: 'Farm',
      start_date: '2026-09-24',
      start_time: '20:30',
      end_time: '22:30',
      roster_id: 'r2',
    });
  });

  it('colle un événement sur une autre date sans ses logs', () => {
    const pasted = pasteEventOn(event({ logs: 'https://wcl/report' }), new Date(2026, 9, 2));
    expect(pasted.start_time).toBe('2026-10-02T20:30:00');
    expect(pasted.end_time).toBe('2026-10-02T22:30:00');
    expect(pasted.logs).toBeNull();
    expect(pasted.description).toBe('Vocal 20h15');
  });

  it('gère « Tous » comme une sélection exclusive', () => {
    expect(toggleInvitedGroup(['admin'], 'all')).toEqual(['all']);
    expect(toggleInvitedGroup(['all'], 'all')).toEqual([]);
    expect(toggleInvitedGroup(['admin'], 'treasurer')).toEqual(['admin', 'treasurer']);
    expect(toggleInvitedGroup(['admin', 'treasurer'], 'admin')).toEqual(['treasurer']);
  });

  it('compte les événements du mois', () => {
    const events = [
      event({ start_time: '2026-09-01T20:00:00' }),
      event({ start_time: '2026-09-30T20:00:00' }),
      event({ start_time: '2026-10-01T20:00:00' }),
    ];
    expect(countEventsInMonth(events, '2026-09-15')).toBe(2);
    expect(countEventsInMonth(events, '')).toBe(0);
  });

  it("regroupe l'agenda par jour à partir d'aujourd'hui", () => {
    const now = new Date(2026, 8, 24, 21, 0);
    const agenda = buildAgenda(
      [
        event({ id: 'b', start_time: '2026-09-26T19:00:00' }),
        event({ id: 'past', start_time: '2026-09-23T20:00:00' }),
        event({ id: 'today', start_time: '2026-09-24T20:30:00' }),
        event({ id: 'a', start_time: '2026-09-26T18:00:00' }),
      ],
      now,
    );
    expect(agenda.map((d) => d.key)).toEqual(['2026-09-24', '2026-09-26']);
    expect(agenda[1].events.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
