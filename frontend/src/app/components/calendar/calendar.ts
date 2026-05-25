import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CalendarService, CalendarEvent } from '../../services/calendar';
import { AuthService } from '../../services/auth';
import { CharacterService } from '../../services/character';
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
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'fr',
    events: [],
    eventClick: this.handleEventClick.bind(this),
    selectable: true,
    select: this.handleDateSelect.bind(this),
    dateClick: this.handleDateClick.bind(this),
  });

  showCreateModal = signal(false);
  
  // New Event Form
  newEvent = {
    title: '',
    description: '',
    start_date: '',
    start_time: '21:00',
    end_date: '',
    end_time: '23:30',
    type: 'raid',
    customType: ''
  };

  isAdmin = computed(() => {
    return this.authService.currentUser()?.is_admin === true;
  });

  constructor(
    private calendarService: CalendarService,
    public authService: AuthService,
    private characterService: CharacterService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadEvents();
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

  handleDateClick(arg: { dateStr: string }) {
    if (!this.isAdmin()) return;
    this.newEvent.start_date = arg.dateStr;
    this.newEvent.end_date = arg.dateStr;
    this.showCreateModal.set(true);
  }

  handleDateSelect(selectInfo: DateSelectArg) {
    if (!this.isAdmin()) return;
    const start = selectInfo.startStr.split('T')[0];
    this.newEvent.start_date = start;
    this.newEvent.end_date = start;
    this.showCreateModal.set(true);
  }

  onDateChange() {
    this.newEvent.end_date = this.newEvent.start_date;
  }

  onTimeChange() {}

  onCreateEvent() {
    const finalType = this.newEvent.type === 'custom' ? this.newEvent.customType : this.newEvent.type;
    let finalEndDate = this.newEvent.start_date;
    if (this.newEvent.end_time < this.newEvent.start_time) {
        const d = new Date(this.newEvent.start_date);
        d.setDate(d.getDate() + 1);
        finalEndDate = d.toISOString().split('T')[0];
    }

    const eventData: CalendarEvent = {
      title: this.newEvent.title,
      description: this.newEvent.description,
      start_time: `${this.newEvent.start_date}T${this.newEvent.start_time}:00`,
      end_time: `${finalEndDate}T${this.newEvent.end_time}:00`,
      type: finalType
    };

    this.calendarService.createEvent(eventData).subscribe(() => {
      this.loadEvents();
      this.closeCreateModal();
    });
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.newEvent = {
      title: '',
      description: '',
      start_date: '',
      start_time: '21:00',
      end_date: '',
      end_time: '23:30',
      type: 'raid',
      customType: ''
    };
  }

  handleEventClick(arg: EventClickArg) {
    const eventId = arg.event.id;
    if (eventId) {
      this.router.navigate(['/events', eventId]);
    }
  }
}
