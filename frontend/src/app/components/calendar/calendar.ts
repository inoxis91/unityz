import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CalendarService, CalendarEvent } from '../../services/calendar';
import { AuthService } from '../../services/auth';
import { CharacterService } from '../../services/character';
import { RosterService } from '../../services/roster';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule, FormsModule, RouterModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css'
})
export class CalendarComponent implements OnInit {
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
      const startTime = event.start ? event.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
      
      let typeClass = 'tag-custom';
      if (type.toLowerCase().includes('raid')) typeClass = 'tag-raid';
      if (type.toLowerCase().includes('mm+')) typeClass = 'tag-mm';

      return {
        html: `
          <div class="custom-event-card">
            <div class="event-time">${startTime}</div>
            <div class="event-title">${event.title}</div>
            <div class="event-tags-container">
              <div class="event-tag ${typeClass}">${type.toUpperCase()}</div>
              ${rosterName ? `<div class="event-tag tag-roster">${rosterName.toUpperCase()}</div>` : '<div class="event-tag tag-all">TOUS</div>'}
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
    roster_id: '' as string | null
  };

  canManageEvents = computed(() => {
    return this.authService.canManageEvents();
  });

  constructor(
    private calendarService: CalendarService,
    public authService: AuthService,
    private characterService: CharacterService,
    public rosterService: RosterService,
    private router: Router,
    private toast: ToastService,
    private confirm: ConfirmService
  ) {}

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

  loadEvents() {
    this.calendarService.getEvents().subscribe(events => {
      const formattedEvents = events.map(e => ({
        id: e.id,
        title: e.title,
        start: e.start_time,
        end: e.end_time,
        allDay: false,
        extendedProps: { ...e },
        backgroundColor: e.type.toLowerCase() === 'raid' ? '#e74c3c' : (e.type.toLowerCase() === 'mm+' ? '#a29bfe' : '#3498db')
      }));
      this.calendarOptions.update(options => ({ ...options, events: formattedEvents }));
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

    const eventData: CalendarEvent = {
      title: this.eventForm.title,
      description: this.eventForm.description,
      start_time: `${this.eventForm.start_date}T${this.eventForm.start_time}:00`,
      end_time: `${finalEndDate}T${this.eventForm.end_time}:00`,
      type: finalType,
      roster_id: this.eventForm.roster_id || null
    };

    if (this.isEditing() && this.selectedEventId()) {
      this.calendarService.updateEvent(this.selectedEventId()!, eventData).subscribe({
        next: () => {
          this.loadEvents();
          this.closeModal();
          this.toast.success('Événement mis à jour avec succès.');
        },
        error: () => this.toast.error('Erreur lors de la mise à jour de l\'événement.')
      });
    } else {
      this.calendarService.createEvent(eventData).subscribe({
        next: () => {
          this.loadEvents();
          this.closeModal();
          this.toast.success('Événement créé avec succès.');
        },
        error: () => this.toast.error('Erreur lors de la création de l\'événement.')
      });
    }
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
      roster_id: ''
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
      customType: ['raid', 'mm+'].includes(props.type) ? '' : props.type,
      roster_id: props.roster_id || ''
    };
    if (this.eventForm.customType) this.eventForm.type = 'custom';

    this.showModal.set(true);
  }

  onDeleteEvent(event: any) {
    this.contextMenu.set(null);
    this.confirm.ask('Supprimer l\'événement', `Êtes-vous sûr de vouloir supprimer "${event.title}" ?`).then(confirmed => {
      if (confirmed) {
        this.calendarService.deleteEvent(event.id).subscribe({
          next: () => {
            this.loadEvents();
            this.toast.success('Événement supprimé.');
          },
          error: () => this.toast.error('Erreur lors de la suppression.')
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
      start_time: `${startH}:${startM}:00`,
      end_time: `${endH}:${endM}:00`
    });
    this.toast.info('Événement copié.');
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
      start_time: `${dateStr}T${copied.start_time}`,
      end_time: `${finalEndDate}T${copied.end_time}`
    };

    this.calendarService.createEvent(eventData).subscribe({
      next: () => {
        this.loadEvents();
        this.toast.success('Événement collé avec succès.');
      },
      error: () => this.toast.error('Erreur lors du collage de l\'événement.')
    });
  }
}
