import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FullCalendarModule } from '@fullcalendar/angular';
import {
  CalendarOptions,
  DateSelectArg,
  DayCellMountArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { forkJoin } from 'rxjs';
import { CalendarEvent, CalendarService, Signup } from '../../services/calendar';
import { AuthService } from '../../services/auth';
import { RosterService } from '../../services/roster';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { I18nService } from '../../services/i18n';
import { escapeHtml } from '../../utils/escape-html';
import { eventTypeKey } from '../../utils/event-type';
import { limitsFor } from '../../constants/tiers';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import { EventFormModalComponent } from './event-form-modal/event-form-modal';
import { buildAgenda, countEventsInMonth, pasteEventOn, toLocalDateStr } from './calendar-utils';

const MENU_WIDTH = 230;
const MENU_HEIGHT = 170;

type SignupStatus = 'signed_up' | 'standby' | 'absent' | null;

type ContextMenu =
  | { x: number; y: number; type: 'event'; event: CalendarEvent }
  | { x: number; y: number; type: 'cell'; date: Date };

@Component({
  selector: 'app-calendar',
  imports: [
    DatePipe,
    FullCalendarModule,
    RouterModule,
    PageHeaderComponent,
    EventFormModalComponent,
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'contextMenu.set(null)',
    '(document:keydown.escape)': 'onEscape()',
    '(window:resize)': 'contextMenu.set(null)',
    '(window:scroll)': 'contextMenu.set(null)',
  },
})
export class CalendarComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly authService = inject(AuthService);
  readonly rosterService = inject(RosterService);
  private readonly calendarService = inject(CalendarService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly toDateStr = toLocalDateStr;

  readonly eventsList = signal<CalendarEvent[]>([]);
  readonly mySignups = signal<Signup[]>([]);
  readonly loaded = signal(false);
  readonly showModal = signal(false);
  readonly saving = signal(false);
  /** Événement en cours de modification ; null pour une création. */
  readonly editingEvent = signal<CalendarEvent | null>(null);
  readonly createDate = signal('');
  readonly contextMenu = signal<ContextMenu | null>(null);
  readonly copiedEvent = signal<CalendarEvent | null>(null);

  readonly canManageEvents = computed(() => this.authService.canManageEvents());
  /** Quota mensuel d'événements de l'offre (vérifié aussi côté serveur). */
  readonly monthlyLimit = computed(
    () => limitsFor(this.authService.currentUser()?.subscription_tier).eventsPerMonth,
  );
  readonly hasMonthlyLimit = computed(() => Number.isFinite(this.monthlyLimit()));
  private readonly locale = computed(() =>
    this.i18n.currentLocale() === 'en' ? 'en-US' : 'fr-FR',
  );

  private readonly statusByEvent = computed(
    () => new Map(this.mySignups().map((s) => [s.event_id, s.status as SignupStatus])),
  );

  readonly agenda = computed(() => buildAgenda(this.eventsList(), new Date()));

  readonly stats = computed(() => {
    const now = Date.now();
    const statuses = this.statusByEvent();
    const upcoming = this.eventsList().filter(
      (e) => !e.is_canceled && new Date(e.start_time).getTime() > now,
    );
    const answered = upcoming.filter((e) => e.id && statuses.get(e.id)).length;
    return {
      thisMonth: countEventsInMonth(this.eventsList(), toLocalDateStr(new Date())),
      upcoming: upcoming.length,
      answered,
      toAnswer: upcoming.length - answered,
    };
  });

  private readonly fcEvents = computed<EventInput[]>(() => {
    const statuses = this.statusByEvent();
    return this.eventsList().map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start_time,
      end: e.end_time,
      allDay: false,
      extendedProps: { ...e, signupStatus: (e.id && statuses.get(e.id)) || null },
      backgroundColor: `var(--ui-event-${eventTypeKey(e.type)})`,
    }));
  });

  readonly calendarOptions = computed<CalendarOptions>(() => {
    const fr = this.i18n.currentLocale() !== 'en';
    return {
      plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin],
      initialView: 'dayGridTwoWeeks',
      views: {
        dayGridTwoWeeks: {
          type: 'dayGrid',
          duration: { weeks: 2 },
          buttonText: fr ? '2 semaines' : '2 weeks',
        },
      },
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridTwoWeeks,dayGridMonth',
      },
      buttonText: {
        today: fr ? "Aujourd'hui" : 'Today',
        month: fr ? 'Mois' : 'Month',
        week: fr ? 'Semaine' : 'Week',
        day: fr ? 'Jour' : 'Day',
        list: fr ? 'Liste' : 'List',
      },
      locale: fr ? 'fr' : 'en',
      firstDay: 1,
      height: 'auto',
      expandRows: true,
      showNonCurrentDates: false,
      selectable: this.canManageEvents(),
      events: this.fcEvents(),
      eventClick: (arg) => this.handleEventClick(arg),
      select: (arg) => this.handleDateSelect(arg),
      eventDidMount: (arg) => this.handleEventDidMount(arg),
      dayCellDidMount: (arg) => this.handleDayCellDidMount(arg),
      eventContent: (arg) => this.renderEvent(arg),
    };
  });

  constructor() {
    // Le formulaire n'a de sens que pour un gestionnaire : on le ferme si le rôle change
    effect(() => {
      if (!this.canManageEvents()) this.showModal.set(false);
    });
  }

  ngOnInit() {
    this.loadEvents();
    this.rosterService.loadRosters().subscribe();
  }

  loadEvents() {
    forkJoin({
      events: this.calendarService.getEvents(),
      signups: this.calendarService.getMySignups(),
    }).subscribe({
      next: ({ events, signups }) => {
        this.eventsList.set(events);
        this.mySignups.set(signups);
        this.loaded.set(true);
      },
      error: (err) => {
        console.error('[Calendar] Error loading calendar data', err);
        this.loaded.set(true);
      },
    });
  }

  signupStatus(eventId: string | undefined): SignupStatus {
    return (eventId && this.statusByEvent().get(eventId)) || null;
  }

  typeKey(type: string | undefined) {
    return eventTypeKey(type);
  }

  typeLabel(type: string): string {
    return eventTypeKey(type) === 'reunion' ? this.i18n.t('calendar.form.type_reunion') : type;
  }

  audienceLabel(event: CalendarEvent): string {
    if (eventTypeKey(event.type) === 'reunion') {
      const groups = event.invited_groups ?? [];
      return !groups.length || groups.includes('all')
        ? this.i18n.t('calendar.tag_all')
        : groups.map((g) => this.groupLabel(g)).join(', ');
    }
    return event.roster_name || this.i18n.t('calendar.tag_all');
  }

  groupLabel(group: string): string {
    return this.i18n.t(`calendar.form.role_${group}`);
  }

  // ---------- FullCalendar ----------

  private renderEvent(arg: EventContentArg) {
    const event = arg.event;
    const type: string = event.extendedProps['type'] || 'custom';
    const status: SignupStatus = event.extendedProps['signupStatus'];
    const isCanceled = !!event.extendedProps['is_canceled'];
    const typeKey = eventTypeKey(type);
    const time = event.start
      ? event.start.toLocaleTimeString(this.locale(), { hour: '2-digit', minute: '2-digit' })
      : '';
    const statusTitles: Record<string, string> = {
      signed_up: this.i18n.t('event.details.status_present'),
      standby: this.i18n.t('event.details.status_maybe'),
      absent: this.i18n.t('event.details.status_absent'),
    };
    const statusTitle =
      (status && statusTitles[status]) || this.i18n.t('dashboard.attendance.status_unregistered');
    const audience = this.audienceLabel(event.extendedProps as CalendarEvent);
    const canceled = isCanceled
      ? `<span class="fc-card-canceled">${escapeHtml(this.i18n.t('event.details.canceled'))}</span> `
      : '';

    // eventContent injecte du HTML brut : tout texte saisi par un utilisateur est échappé
    return {
      html: `
        <div class="fc-card type-${typeKey}${isCanceled ? ' is-canceled' : ''}">
          <div class="fc-card-top">
            <span class="fc-card-time">${escapeHtml(time)}</span>
            <span class="fc-card-status status-${status ?? 'none'}" role="img"
              title="${escapeHtml(statusTitle)}" aria-label="${escapeHtml(statusTitle)}"></span>
          </div>
          <div class="fc-card-title">${canceled}${escapeHtml(event.title)}</div>
          <div class="fc-card-tags">
            <span class="fc-card-tag tag-${typeKey}">${escapeHtml(this.typeLabel(type))}</span>
            <span class="fc-card-tag tag-audience" title="${escapeHtml(audience)}">${escapeHtml(audience)}</span>
          </div>
        </div>`,
    };
  }

  private handleEventClick(arg: EventClickArg) {
    if (arg.event.id) this.router.navigate(['/events', arg.event.id]);
  }

  private handleDateSelect(arg: DateSelectArg) {
    arg.view.calendar.unselect();
    this.openCreate(arg.startStr.split('T')[0]);
  }

  private handleEventDidMount(info: EventMountArg) {
    info.el.addEventListener('contextmenu', (e: MouseEvent) => {
      const event = this.eventsList().find((ev) => ev.id === info.event.id);
      if (!this.canManageEvents() || !event) return;
      e.preventDefault();
      e.stopPropagation();
      this.openMenuAt(e.clientX, e.clientY, { type: 'event', event });
    });
  }

  private handleDayCellDidMount(info: DayCellMountArg) {
    info.el.addEventListener('contextmenu', (e: MouseEvent) => {
      if (!this.canManageEvents()) return;
      e.preventDefault();
      e.stopPropagation();
      this.openMenuAt(e.clientX, e.clientY, { type: 'cell', date: info.date });
    });
  }

  // ---------- Menu contextuel ----------

  /** Menu ⋯ d'une carte de l'agenda : alternative tactile et clavier au clic droit. */
  openEventMenu(e: MouseEvent, event: CalendarEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.openMenuAt(rect.right - MENU_WIDTH, rect.bottom + 6, { type: 'event', event });
  }

  private openMenuAt(
    x: number,
    y: number,
    target: { type: 'event'; event: CalendarEvent } | { type: 'cell'; date: Date },
  ) {
    // Reste dans la fenêtre, même près des bords
    const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));
    this.contextMenu.set({ x: left, y: top, ...target } as ContextMenu);
  }

  onEscape() {
    if (this.contextMenu()) this.contextMenu.set(null);
    // La modale gère sa propre touche Échap
  }

  // ---------- Création / édition ----------

  openCreate(date = toLocalDateStr(new Date())) {
    if (!this.canManageEvents()) return;
    this.contextMenu.set(null);
    this.createDate.set(date);
    this.editingEvent.set(null);
    this.showModal.set(true);
  }

  onEditEvent(event: CalendarEvent) {
    this.contextMenu.set(null);
    this.editingEvent.set(event);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingEvent.set(null);
    this.saving.set(false);
  }

  private reachedMonthlyLimit(dateStr: string): boolean {
    const limit = this.monthlyLimit();
    if (countEventsInMonth(this.eventsList(), dateStr) < limit) return false;
    this.toast.error(this.i18n.t('calendar.toast.limit_reached').replace('{count}', String(limit)));
    return true;
  }

  onSubmitEvent(payload: CalendarEvent) {
    if (this.saving()) return;
    const id = this.editingEvent()?.id;
    if (!id && this.reachedMonthlyLimit(payload.start_time.slice(0, 10))) return;

    this.saving.set(true);
    const request = id
      ? this.calendarService.updateEvent(id, payload)
      : this.calendarService.createEvent(payload);

    request.subscribe({
      next: () => {
        this.loadEvents();
        this.closeModal();
        this.toast.success(
          this.i18n.t(id ? 'calendar.toast.update_success' : 'calendar.toast.create_success'),
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(
          err?.error?.message ||
            this.i18n.t(id ? 'calendar.toast.update_error' : 'calendar.toast.create_error'),
        );
      },
    });
  }

  // ---------- Actions ----------

  async onDeleteEvent(event: CalendarEvent) {
    this.contextMenu.set(null);
    const confirmed = await this.confirm.ask(
      this.i18n.t('calendar.confirm.delete_title'),
      this.i18n.t('calendar.confirm.delete_desc').replace('{eventTitle}', event.title),
      undefined,
      undefined,
      true,
    );
    if (!confirmed || !event.id) return;

    // Retrait optimiste, restauré si l'API refuse
    const previous = this.eventsList();
    this.eventsList.set(previous.filter((e) => e.id !== event.id));
    this.calendarService.deleteEvent(event.id).subscribe({
      next: () => this.toast.success(this.i18n.t('calendar.toast.delete_success')),
      error: () => {
        this.eventsList.set(previous);
        this.toast.error(this.i18n.t('calendar.toast.delete_error'));
      },
    });
  }

  onCopyEvent(event: CalendarEvent) {
    this.contextMenu.set(null);
    this.copiedEvent.set(event);
    this.toast.info(this.i18n.t('calendar.toast.copied'));
  }

  onPasteEvent(date: Date) {
    this.contextMenu.set(null);
    const copied = this.copiedEvent();
    if (!copied || this.reachedMonthlyLimit(toLocalDateStr(date))) return;

    this.calendarService.createEvent(pasteEventOn(copied, date)).subscribe({
      next: () => {
        this.loadEvents();
        this.toast.success(this.i18n.t('calendar.toast.paste_success'));
      },
      error: (err) =>
        this.toast.error(err?.error?.message || this.i18n.t('calendar.toast.paste_error')),
    });
  }
}
