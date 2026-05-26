import { Component, OnInit, signal, computed, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { CharacterService, Character } from '../../services/character';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { RosterService, Roster } from '../../services/roster';
import { FeeService, FeeAllocation } from '../../services/fee';

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
  mySignups = signal<Signup[]>([]);
  myRoster = signal<Roster | null>(null);
  myAllocations = signal<FeeAllocation[]>([]);
  currentTime = signal(new Date());

  charDetails = signal<any>(null);
  loadingDetails = signal(false);

  private timerInterval: any;

  mainCharacter = computed(() => this.myCharacters().find(c => c.is_main));

  // Computed summary for next 3 months
  feeSummary = computed(() => {
    const months: { name: string, status: any }[] = [];
    const now = new Date();
    
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      // Manually construct YYYY-MM in local time to avoid timezone shifts
      const year = d.getFullYear();
      const monthNum = d.getMonth() + 1;
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}`;
      
      const alloc = this.myAllocations().find(a => a.month_date.startsWith(dateStr));
      
      const monthName = d.toLocaleDateString('fr-FR', { month: 'long' });
      const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      
      let status = { class: 'none', icon: '⭕', label: '0 PO' };
      if (alloc) {
        if (alloc.amount >= 2000) {
          status = { 
            class: alloc.amount > 2000 ? 'donation' : 'paid', 
            icon: alloc.amount > 2000 ? '⭐' : '✅',
            label: `${alloc.amount} PO`
          };
        } else {
          status = { class: 'partial', icon: '⚠️', label: `${alloc.amount} PO` };
        }
      }
      
      months.push({ name: capitalized, status });
    }
    return months;
  });

  constructor(
    public authService: AuthService,
    public characterService: CharacterService,
    private calendarService: CalendarService,
    private rosterService: RosterService,
    private feeService: FeeService
  ) {
    // Fetch details when main character is loaded
    effect(() => {
      const main = this.mainCharacter();
      if (main) {
        this.fetchCharacterDetails(main);
      }
    });
  }

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

    // Load signups
    this.calendarService.getMySignups().subscribe(signups => this.mySignups.set(signups));

    // Load roster
    this.rosterService.getMyRoster().subscribe(roster => this.myRoster.set(roster));

    // Load allocations
    const currentYear = new Date().getFullYear();
    this.feeService.loadMyAllocations(currentYear).subscribe(allocs => this.myAllocations.set(allocs));
  }

  fetchCharacterDetails(char: Character) {
    this.loadingDetails.set(true);
    this.characterService.getCharacterDetails(char.realm, char.name).subscribe({
      next: (details) => {
        this.charDetails.set(details);
        this.loadingDetails.set(false);
      },
      error: () => this.loadingDetails.set(false)
    });
  }

  getCharacterImage(): string | null {
    const details = this.charDetails();
    if (!details || !details.media || !details.media.assets) return null;
    
    const assets = details.media.assets;
    // Order of preference for a nice dashboard render
    const preferredKeys = ['main-raw', 'main', 'inset', 'portrait', 'avatar'];
    
    for (const key of preferredKeys) {
      const asset = assets.find((a: any) => a.key === key);
      if (asset) return asset.value;
    }
    
    return assets[0].value;
  }

  getSignupStatus(eventId: string | undefined): Signup | undefined {
    if (!eventId) return undefined;
    return this.mySignups().find(s => s.event_id === eventId);
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
