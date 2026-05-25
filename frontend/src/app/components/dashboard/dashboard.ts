import { Component, OnInit, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { CharacterService, Character } from '../../services/character';
import { CalendarService, CalendarEvent } from '../../services/calendar';
import { RosterService, Roster } from '../../services/roster';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  myCharacters = signal<Character[]>([]);
  upcomingEvents = signal<CalendarEvent[]>([]);
  myRoster = signal<Roster | null>(null);
  currentTime = signal(new Date());
  private timerInterval: any;

  mainCharacter = computed(() => this.myCharacters().find(c => c.is_main));

  constructor(
    public authService: AuthService,
    private characterService: CharacterService,
    private calendarService: CalendarService,
    private rosterService: RosterService
  ) {}

  ngOnInit() {
    this.loadData();
    this.timerInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 60000); // Update every minute
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  loadData() {
    // Load characters
    this.characterService.getMyCharacters().subscribe(chars => this.myCharacters.set(chars));
    
    // Load events and filter for upcoming
    this.calendarService.getEvents().subscribe(events => {
      const now = new Date();
      const upcoming = events
        .filter(e => new Date(e.start_time) > now)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 3); // Only next 3
      this.upcomingEvents.set(upcoming);
    });

    // Load roster
    this.rosterService.getMyRoster().subscribe(roster => this.myRoster.set(roster));
  }

  getCountdown(startTime: string): string {
    const start = new Date(startTime).getTime();
    const now = this.currentTime().getTime();
    const diff = start - now;

    if (diff <= 0) return 'En cours';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
