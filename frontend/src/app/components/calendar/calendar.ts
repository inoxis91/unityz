import { Component, OnInit, signal, computed, HostListener, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { AuthService } from '../../services/auth';
import { CharacterService } from '../../services/character';
import { RosterService } from '../../services/roster';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { I18nService } from '../../services/i18n';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule, FormsModule, RouterModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css'
})
export class CalendarComponent implements OnInit {
  public i18n = inject(I18nService);

  calendarOptions = signal<CalendarOptions>({
    plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin],
    initialView: 'dayGridTwoWeeks',
    views: {
      dayGridTwoWeeks: {
        type: 'dayGrid',
        duration: { weeks: 2 },
        buttonText: '2 Semaines'
      }
    },
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridTwoWeeks,dayGridMonth'
    },
    buttonText: {
      today: 'Aujourd\'hui',
      month: 'Mois',
      week: 'Semaine',
      day: 'Jour',
      list: 'Liste'
    },
    locale: 'fr',
    firstDay: 1, // Start on Monday
    events: [],
    eventClick: this.handleEventClick.bind(this),
    selectable: true,
    select: this.handleDateSelect.bind(this),
    dateClick: this.handleDateClick.bind(this),
    height: 'auto',
    expandRows: true,
    showNonCurrentDates: false,
    eventDidMount: this.handleEventDidMount.bind(this),
    dayCellDidMount: this.handleDayCellDidMount.bind(this),
    eventContent: (arg) => {
      const event = arg.event;
      const type = event.extendedProps['type'] || 'custom';
      const rosterName = event.extendedProps['roster_name'];
      const signupStatus = event.extendedProps['signupStatus'];
      const isCanceled = event.extendedProps['is_canceled'];
      const startTime = event.start ? event.start.toLocaleTimeString(this.i18n.currentLocale() === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      
      let typeClass = 'tag-custom';
      if (type.toLowerCase().includes('raid')) typeClass = 'tag-raid';
      if (type.toLowerCase().includes('mm+')) typeClass = 'tag-mm';
      if (type.toLowerCase().includes('reunion')) typeClass = 'tag-reunion';

      // Determine signup status badge html
      let statusHtml = '';
      if (signupStatus === 'signed_up') {
        statusHtml = '<span class="status-indicator-badge present" title="Présent">✅</span>';
      } else if (signupStatus === 'standby') {
        statusHtml = '<span class="status-indicator-badge standby" title="Peut-être">❓</span>';
      } else if (signupStatus === 'absent') {
        statusHtml = '<span class="status-indicator-badge absent" title="Absent">❌</span>';
      } else {
        statusHtml = '<span class="status-indicator-badge none" title="Non répondu">⚪</span>';
      }

      const isReunion = type.toLowerCase() === 'reunion';
      const invitedGroups = event.extendedProps['invited_groups'];
      const isReunionAll = isReunion && (!invitedGroups || invitedGroups.includes('all'));
      const reunionLabel = isReunion && !isReunionAll ? this.getInvitedGroupsLabel(invitedGroups) : '';

      const rosterHtml = rosterName 
        ? `<div class="event-tag tag-roster">${rosterName.toUpperCase()}</div>` 
        : (isReunion && !isReunionAll 
            ? `<div class="event-tag tag-roster" title="${reunionLabel}">${reunionLabel.toUpperCase()}</div>` 
            : `<div class="event-tag tag-all">${this.i18n.t('calendar.tag_all').toUpperCase()}</div>`);

      const borderStyle = isCanceled 
        ? 'border-left: 5px solid #94a3b8 !important;' 
        : (type.toLowerCase() === 'raid' ? 'border-left: 5px solid #e74c3c !important;' : (type.toLowerCase() === 'mm+' ? 'border-left: 5px solid #a29bfe !important;' : (type.toLowerCase() === 'reunion' ? 'border-left: 5px solid #10b981 !important;' : 'border-left: 5px solid #3498db !important;')));

      const titlePrefix = isCanceled ? `<span class="canceled-tag">[${this.i18n.t('event.details.canceled')}]</span> ` : '';

      return {
        html: `
          <div class="custom-event-card ${isCanceled ? 'canceled-event' : ''}" style="${borderStyle}">
            <div class="event-time-row-calendar">
              <div class="event-time">${startTime}</div>
              ${statusHtml}
            </div>
            <div class="event-title">${titlePrefix}${event.title}</div>
            <div class="event-tags-container">
              <div class="event-tag ${typeClass}">${isReunion ? this.i18n.t('calendar.form.type_reunion').toUpperCase() : type.toUpperCase()}</div>
              ${rosterHtml}
            </div>
          </div>
        `
      };
    }
  });

  showModal = signal(false);
  isEditing = signal(false);
  selectedEventId = signal<string | null>(null);
  contextMenu = signal<{ x: number, y: number, type: 'event' | 'cell', data: any } | null>(null);
  copiedEvent = signal<CalendarEvent | null>(null);
  
  // Event Form
  eventForm = {
    title: '',
    description: '',
    start_date: '',
    start_time: '20:30',
    end_date: '',
    end_time: '22:30',
    type: 'raid',
    customType: '',
    roster_id: '' as string | null,
    invited_groups: [] as string[]
  };

  canManageEvents = computed(() => {
    return this.authService.canManageEvents();
  });

  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');

  getEventsInMonthCount(dateStr: string): number {
    if (!dateStr) return 0;
    const targetDate = new Date(dateStr);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();

    return this.eventsList().filter(e => {
      const eDate = new Date(e.start_time);
      return eDate.getFullYear() === targetYear && eDate.getMonth() === targetMonth;
    }).length;
  }

  eventsList = signal<CalendarEvent[]>([]);
  mySignups = signal<Signup[]>([]);

  upcomingEvents = computed(() => {
    const now = new Date();
    // Set time to beginning of the day to show all of today's upcoming events
    now.setHours(0, 0, 0, 0);
    return this.eventsList()
      .filter(e => new Date(e.start_time) >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  onCreateEventMobile() {
    if (!this.canManageEvents()) return;
    const todayStr = new Date().toISOString().split('T')[0];
    this.eventForm.start_date = todayStr;
    this.eventForm.end_date = todayStr;
    this.isEditing.set(false);
    this.showModal.set(true);
  }

  constructor(
    private calendarService: CalendarService,
    public authService: AuthService,
    private characterService: CharacterService,
    public rosterService: RosterService,
    private router: Router,
    private toast: ToastService,
    private confirm: ConfirmService
  ) {
    effect(() => {
      const locale = this.i18n.currentLocale();
      this.calendarOptions.update(options => ({
        ...options,
        locale: locale,
        buttonText: {
          today: locale === 'fr' ? "Aujourd'hui" : 'Today',
          month: locale === 'fr' ? 'Mois' : 'Month',
          week: locale === 'fr' ? 'Semaine' : 'Week',
          day: locale === 'fr' ? 'Jour' : 'Day',
          list: locale === 'fr' ? 'Liste' : 'List'
        },
        views: {
          dayGridTwoWeeks: {
            type: 'dayGrid',
            duration: { weeks: 2 },
            buttonText: locale === 'fr' ? '2 Semaines' : '2 Weeks'
          }
        }
      }));
    });
  }

  ngOnInit() {
    this.loadEvents();
    this.rosterService.loadRosters().subscribe();
  }

  @HostListener('document:click')
  closeContextMenu() {
    this.contextMenu.set(null);
  }

  @HostListener('document:contextmenu')
  closeContextMenuOnRightClick() {
    this.contextMenu.set(null);
  }

  getEventSignupStatus(eventId: string | undefined): string | null {
    if (!eventId) return null;
    const signup = this.mySignups().find(s => s.event_id === eventId);
    return signup ? signup.status : null;
  }

  loadEvents() {
    forkJoin({
      events: this.calendarService.getEvents(),
      signups: this.calendarService.getMySignups()
    }).subscribe({
      next: ({ events, signups }) => {
        this.eventsList.set(events);
        this.mySignups.set(signups);
        
        const formattedEvents = events.map(e => {
          const signup = signups.find(s => s.event_id === e.id);
          const signupStatus = signup ? signup.status : null;
          
          return {
            id: e.id,
            title: e.title,
            start: e.start_time,
            end: e.end_time,
            allDay: false,
            extendedProps: { ...e, signupStatus },
            backgroundColor: e.type.toLowerCase() === 'raid' ? '#e74c3c' : (e.type.toLowerCase() === 'mm+' ? '#a29bfe' : (e.type.toLowerCase() === 'reunion' ? '#10b981' : '#3498db'))
          };
        });
        
        this.calendarOptions.update(options => ({ ...options, events: formattedEvents }));
      },
      error: (err) => {
        console.error('Error loading calendar data:', err);
      }
    });
  }

  handleEventDidMount(info: any) {
    info.el.addEventListener('contextmenu', (e: MouseEvent) => {
      if (!this.canManageEvents()) return;
      e.preventDefault();
      e.stopPropagation();
      this.contextMenu.set({
        x: e.clientX,
        y: e.clientY,
        type: 'event',
        data: info.event
      });
    });
  }

  handleDayCellDidMount(info: any) {
    info.el.addEventListener('contextmenu', (e: MouseEvent) => {
      if (!this.canManageEvents()) return;
      e.preventDefault();
      e.stopPropagation();
      this.contextMenu.set({
        x: e.clientX,
        y: e.clientY,
        type: 'cell',
        data: info.date
      });
    });
  }

  handleDateClick(arg: { dateStr: string }) {
    if (!this.canManageEvents()) return;
    this.eventForm.start_date = arg.dateStr;
    this.eventForm.end_date = arg.dateStr;
    this.isEditing.set(false);
    this.showModal.set(true);
  }

  handleDateSelect(selectInfo: DateSelectArg) {
    if (!this.canManageEvents()) return;
    const start = selectInfo.startStr.split('T')[0];
    this.eventForm.start_date = start;
    this.eventForm.end_date = start;
    this.isEditing.set(false);
    this.showModal.set(true);
  }

  onDateChange() {
    this.eventForm.end_date = this.eventForm.start_date;
  }

  onTimeChange() {}

  onSubmitEvent() {
    const finalType = this.eventForm.type === 'custom' ? this.eventForm.customType : this.eventForm.type;
    let finalEndDate = this.eventForm.start_date;
    if (this.eventForm.end_time < this.eventForm.start_time) {
        const d = new Date(this.eventForm.start_date);
        d.setDate(d.getDate() + 1);
        finalEndDate = d.toISOString().split('T')[0];
    }

    // Check event limit for non-pro when creating (not editing)
    if (!this.isPro() && !this.isEditing()) {
      const count = this.getEventsInMonthCount(this.eventForm.start_date);
      if (count >= 6) {
        this.toast.error(this.i18n.t('calendar.toast.limit_reached'));
        return;
      }
    }

    const eventData: CalendarEvent = {
      title: this.eventForm.title,
      description: this.eventForm.description,
      start_time: `${this.eventForm.start_date}T${this.eventForm.start_time}:00`,
      end_time: `${finalEndDate}T${this.eventForm.end_time}:00`,
      type: finalType,
      roster_id: finalType === 'reunion' ? null : (this.eventForm.roster_id || null),
      invited_groups: finalType === 'reunion' ? (this.eventForm.invited_groups || []) : []
    };

    if (this.isEditing() && this.selectedEventId()) {
      this.calendarService.updateEvent(this.selectedEventId()!, eventData).subscribe({
        next: () => {
          this.loadEvents();
          this.closeModal();
          this.toast.success(this.i18n.t('calendar.toast.update_success'));
        },
        error: () => this.toast.error(this.i18n.t('calendar.toast.update_error'))
      });
    } else {
      this.calendarService.createEvent(eventData).subscribe({
        next: () => {
          this.loadEvents();
          this.closeModal();
          this.toast.success(this.i18n.t('calendar.toast.create_success'));
        },
        error: () => this.toast.error(this.i18n.t('calendar.toast.create_error'))
      });
    }
  }

  isGroupChecked(group: string): boolean {
    return this.eventForm.invited_groups?.includes(group) || false;
  }

  toggleGroup(group: string) {
    if (!this.eventForm.invited_groups) {
      this.eventForm.invited_groups = [];
    }
    
    if (group === 'all') {
      if (this.isGroupChecked('all')) {
        this.eventForm.invited_groups = [];
      } else {
        this.eventForm.invited_groups = ['all'];
      }
    } else {
      if (this.isGroupChecked(group)) {
        this.eventForm.invited_groups = this.eventForm.invited_groups.filter(g => g !== group);
      } else {
        this.eventForm.invited_groups = [...this.eventForm.invited_groups, group];
      }
    }
  }

  getInvitedGroupsLabel(invitedGroups: string[] | undefined): string {
    if (!invitedGroups || invitedGroups.length === 0) return '';
    return invitedGroups.map(g => {
      if (g === 'admin') return this.i18n.t('calendar.form.role_admin');
      if (g === 'raid_leader') return this.i18n.t('calendar.form.role_raid_leader');
      if (g === 'treasurer') return this.i18n.t('calendar.form.role_treasurer');
      if (g === 'event_manager') return this.i18n.t('calendar.form.role_event_manager');
      return g;
    }).join(', ');
  }

  closeModal() {
    this.showModal.set(false);
    this.isEditing.set(false);
    this.selectedEventId.set(null);
    this.eventForm = {
      title: '',
      description: '',
      start_date: '',
      start_time: '20:30',
      end_date: '',
      end_time: '22:30',
      type: 'raid',
      customType: '',
      roster_id: '',
      invited_groups: []
    };
  }

  handleEventClick(arg: EventClickArg) {
    const eventId = arg.event.id;
    if (eventId) {
      this.router.navigate(['/events', eventId]);
    }
  }

  // Context Menu Actions
  onEditEvent(event: any) {
    this.contextMenu.set(null);
    const props = event.extendedProps;
    this.isEditing.set(true);
    this.selectedEventId.set(event.id);
    
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : start;

    // Format times to HH:mm
    const startH = String(start.getHours()).padStart(2, '0');
    const startM = String(start.getMinutes()).padStart(2, '0');
    const endH = String(end.getHours()).padStart(2, '0');
    const endM = String(end.getMinutes()).padStart(2, '0');

    this.eventForm = {
      title: event.title,
      description: props.description || '',
      start_date: start.toISOString().split('T')[0],
      start_time: `${startH}:${startM}`,
      end_date: end.toISOString().split('T')[0],
      end_time: `${endH}:${endM}`,
      type: props.type,
      customType: ['raid', 'mm+', 'reunion'].includes(props.type) ? '' : props.type,
      roster_id: props.roster_id || '',
      invited_groups: props.invited_groups || []
    };
    if (this.eventForm.customType) this.eventForm.type = 'custom';

    this.showModal.set(true);
  }

  onDeleteEvent(event: any) {
    this.contextMenu.set(null);
    this.confirm.ask(this.i18n.t('calendar.confirm.delete_title'), this.i18n.t('calendar.confirm.delete_desc').replace('{eventTitle}', event.title)).then(confirmed => {
      if (confirmed) {
        this.calendarService.deleteEvent(event.id).subscribe({
          next: () => {
            this.loadEvents();
            this.toast.success(this.i18n.t('calendar.toast.delete_success'));
          },
          error: () => this.toast.error(this.i18n.t('calendar.toast.delete_error'))
        });
      }
    });
  }

  onCopyEvent(event: any) {
    this.contextMenu.set(null);
    const props = event.extendedProps;
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : start;

    const startH = String(start.getHours()).padStart(2, '0');
    const startM = String(start.getMinutes()).padStart(2, '0');
    const endH = String(end.getHours()).padStart(2, '0');
    const endM = String(end.getMinutes()).padStart(2, '0');

    this.copiedEvent.set({
      title: event.title,
      description: props.description || '',
      type: props.type,
      roster_id: props.roster_id || null,
      invited_groups: props.invited_groups || [],
      start_time: `${startH}:${startM}:00`,
      end_time: `${endH}:${endM}:00`
    });
    this.toast.info(this.i18n.t('calendar.toast.copied'));
  }

  onCreateEventFromCell(date: Date) {
    this.contextMenu.set(null);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.eventForm.start_date = dateStr;
    this.eventForm.end_date = dateStr;
    this.isEditing.set(false);
    this.showModal.set(true);
  }

  onPasteEvent(date: Date) {
    this.contextMenu.set(null);
    const copied = this.copiedEvent();
    if (!copied) return;

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Check if end time is on next day (not perfect but covers common cases)
    let finalEndDate = dateStr;
    if (copied.end_time < copied.start_time) {
        const d = new Date(date);
        d.setDate(d.getDate() + 1);
        finalEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const eventData: CalendarEvent = {
      title: copied.title,
      description: copied.description,
      type: copied.type,
      roster_id: copied.roster_id,
      invited_groups: copied.invited_groups,
      start_time: `${dateStr}T${copied.start_time}`,
      end_time: `${finalEndDate}T${copied.end_time}`
    };

    this.calendarService.createEvent(eventData).subscribe({
      next: () => {
        this.loadEvents();
        this.toast.success(this.i18n.t('calendar.toast.paste_success'));
      },
      error: () => this.toast.error(this.i18n.t('calendar.toast.paste_error'))
    });
  }
}
