import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarService, CalendarEvent } from '../../services/calendar';
import { AdminRostersComponent } from './admin-rosters/admin-rosters';
import { AdminFeesComponent } from './admin-fees/admin-fees';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminRostersComponent, AdminFeesComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit {
  activeTab = signal<'events' | 'rosters' | 'fees'>('events');
  events = signal<CalendarEvent[]>([]);
  
  // New Event Form
  newEvent: CalendarEvent = {
    title: '',
    description: '',
    start_time: '20:30',
    end_time: '22:30',
    type: 'raid'
  };

  constructor(private calendarService: CalendarService) {}

  ngOnInit() {
    this.loadEvents();
  }

  loadEvents() {
    this.calendarService.getEvents().subscribe(events => {
      this.events.set(events);
    });
  }

  onSubmit() {
    this.calendarService.createEvent(this.newEvent).subscribe(() => {
      this.loadEvents();
      this.resetForm();
    });
  }

  deleteEvent(id: string) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
      this.calendarService.deleteEvent(id).subscribe(() => {
        this.loadEvents();
      });
    }
  }

  resetForm() {
    this.newEvent = {
      title: '',
      description: '',
      start_time: '20:30',
      end_time: '22:30',
      type: 'raid'
    };
  }
}
