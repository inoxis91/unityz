import { CalendarEvent } from '../../services/calendar';

export type EventFormType = 'raid' | 'mm+' | 'reunion' | 'custom';

export interface EventForm {
  title: string;
  description: string;
  /** YYYY-MM-DD, heure locale. */
  start_date: string;
  /** HH:mm */
  start_time: string;
  end_time: string;
  type: EventFormType;
  customType: string;
  roster_id: string;
  invited_groups: string[];
  logs: string;
}

export const INVITABLE_GROUPS = ['admin', 'raid_leader', 'treasurer', 'event_manager'] as const;

const STANDARD_TYPES = ['raid', 'mm+', 'reunion'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale au format YYYY-MM-DD (toISOString décalerait d'un jour autour de minuit). */
export function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalTimeStr(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Ajoute des jours à une date YYYY-MM-DD, en heure locale. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toLocalDateStr(new Date(y, m - 1, d + days));
}

export function emptyEventForm(date = ''): EventForm {
  return {
    title: '',
    description: '',
    start_date: date,
    start_time: '20:30',
    end_time: '22:30',
    type: 'raid',
    customType: '',
    roster_id: '',
    invited_groups: [],
    logs: '',
  };
}

export function formFromEvent(event: CalendarEvent): EventForm {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : start;
  const isCustom = !STANDARD_TYPES.includes(event.type);
  return {
    title: event.title,
    description: event.description || '',
    start_date: toLocalDateStr(start),
    start_time: toLocalTimeStr(start),
    end_time: toLocalTimeStr(end),
    type: isCustom ? 'custom' : (event.type as EventFormType),
    customType: isCustom ? event.type : '',
    roster_id: event.roster_id || '',
    invited_groups: [...(event.invited_groups ?? [])],
    logs: event.logs || '',
  };
}

/**
 * Corps envoyé à l'API. Une heure de fin antérieure au début signifie que l'activité se
 * termine le lendemain (raid de 23 h à 1 h).
 */
export function buildEventPayload(form: EventForm): CalendarEvent {
  const type = form.type === 'custom' ? form.customType.trim() : form.type;
  const endDate = form.end_time < form.start_time ? addDays(form.start_date, 1) : form.start_date;
  return {
    title: form.title.trim(),
    description: form.description,
    start_time: `${form.start_date}T${form.start_time}:00`,
    end_time: `${endDate}T${form.end_time}:00`,
    type,
    roster_id: type === 'reunion' ? null : form.roster_id || null,
    invited_groups: type === 'reunion' ? form.invited_groups : [],
    logs: type === 'raid' ? form.logs.trim() || null : null,
  };
}

/** Copie d'un événement reportée sur une autre date (mêmes horaires, sans logs). */
export function pasteEventOn(source: CalendarEvent, date: Date): CalendarEvent {
  const form = formFromEvent(source);
  return {
    ...buildEventPayload({ ...form, start_date: toLocalDateStr(date), logs: '' }),
    description: source.description || '',
  };
}

/** Sélection « Tous » exclusive ; sinon bascule le groupe. */
export function toggleInvitedGroup(groups: string[], group: string): string[] {
  if (group === 'all') return groups.includes('all') ? [] : ['all'];
  return groups.includes(group) ? groups.filter((g) => g !== group) : [...groups, group];
}

export function countEventsInMonth(events: CalendarEvent[], dateStr: string): number {
  if (!dateStr) return 0;
  const [y, m] = dateStr.split('-').map(Number);
  return events.filter((e) => {
    const d = new Date(e.start_time);
    return d.getFullYear() === y && d.getMonth() === m - 1;
  }).length;
}

export interface AgendaDay {
  key: string;
  date: Date;
  events: CalendarEvent[];
}

/** Événements à partir d'aujourd'hui (00:00), regroupés par jour local et triés. */
export function buildAgenda(events: CalendarEvent[], now: Date): AgendaDay[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = new Map<string, AgendaDay>();
  const sorted = events
    .filter((e) => new Date(e.start_time).getTime() >= from)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  for (const event of sorted) {
    const date = new Date(event.start_time);
    const key = toLocalDateStr(date);
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        events: [],
      };
      days.set(key, day);
    }
    day.events.push(event);
  }
  return [...days.values()];
}
