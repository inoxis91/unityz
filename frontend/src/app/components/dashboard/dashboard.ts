import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { CharacterService, Character } from '../../services/character';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { RosterService, Roster } from '../../services/roster';
import { FeeService, FeeAllocation } from '../../services/fee';
import { I18nService } from '../../services/i18n';
import { DashboardBirthdaysComponent, GuildBirthday } from './birthdays/birthdays';
import { DashboardParsesComponent } from './parses/parses';
import { CountUpDirective } from '../../shared/wcl/count-up';
import { eventTypeKey } from '../../utils/event-type';
import {
  buildFeeSummary,
  formatCountdown,
  pickCharacterImage,
  pickUpcomingEvents,
} from './dashboard-utils';

interface Attendance {
  percentage: number;
  total_eligible: number;
  attended: number;
  events: {
    id: string;
    title: string;
    start_time: string;
    status: string | null;
    roster_name?: string | null;
    character_name?: string | null;
  }[];
}

type SignupTone = 'success' | 'warning' | 'danger' | 'neutral';

const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    RouterModule,
    DashboardBirthdaysComponent,
    DashboardParsesComponent,
    CountUpDirective,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'showAttendanceModal.set(false)' },
})
export class DashboardComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly authService = inject(AuthService);
  readonly characterService = inject(CharacterService);
  private readonly calendarService = inject(CalendarService);
  private readonly rosterService = inject(RosterService);
  private readonly feeService = inject(FeeService);

  readonly myCharacters = signal<Character[]>([]);
  readonly charactersLoaded = signal(false);
  private readonly events = signal<CalendarEvent[]>([]);
  readonly eventsLoaded = signal(false);
  readonly mySignups = signal<Signup[]>([]);
  readonly myRoster = signal<Roster | null>(null);
  readonly myAllocations = signal<FeeAllocation[]>([]);
  readonly myAttendance = signal<Attendance | null>(null);
  readonly birthdays = signal<GuildBirthday[]>([]);
  readonly currentTime = signal(new Date());
  readonly showAttendanceModal = signal(false);

  readonly charDetails = signal<any>(null);
  readonly loadingDetails = signal(false);
  readonly rioScores = signal<ReadonlyMap<string, number>>(new Map());

  readonly ringRadius = RING_RADIUS;
  readonly ringCircumference = RING_CIRCUMFERENCE;

  readonly locale = computed(() => (this.i18n.currentLocale() === 'en' ? 'en-US' : 'fr-FR'));
  readonly mainCharacter = computed(() => this.myCharacters().find((c) => c.is_main));
  readonly mainImage = computed(() => pickCharacterImage(this.charDetails()));
  readonly mainRio = computed(() => {
    const main = this.mainCharacter();
    return main ? this.rioOf(main) : null;
  });

  readonly greeting = computed(() => {
    const h = this.currentTime().getHours();
    if (h < 5 || h >= 18) return this.i18n.t('dashboard.greeting_evening');
    return this.i18n.t('dashboard.welcome');
  });

  readonly todayLabel = computed(() =>
    this.currentTime().toLocaleDateString(this.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  readonly minimumFee = computed(
    () => this.authService.currentUser()?.active_guild_minimum_fee_amount ?? 2000,
  );

  readonly feeSummary = computed(() =>
    buildFeeSummary(this.myAllocations(), this.minimumFee(), new Date(), this.locale()),
  );

  readonly currentFee = computed(() => this.feeSummary()[0]);

  /** Signups indexés par événement pour éviter une recherche linéaire par carte. */
  private readonly signupByEvent = computed(
    () => new Map(this.mySignups().map((s) => [s.event_id, s])),
  );

  readonly upcoming = computed(() => {
    const now = this.currentTime();
    const dayUnit = this.i18n.t('dashboard.days_short');
    const signups = this.signupByEvent();
    return pickUpcomingEvents(this.events(), now).map((event) => ({
      event,
      tone: eventTypeKey(event.type),
      countdown: formatCountdown(event.start_time, now, dayUnit),
      signup: this.signupView(event.id ? signups.get(event.id) : undefined),
    }));
  });

  readonly nextEvent = computed(() => this.upcoming()[0] ?? null);

  readonly attendanceOffset = computed(() => {
    const pct = Math.min(100, Math.max(0, this.myAttendance()?.percentage ?? 0));
    return RING_CIRCUMFERENCE * (1 - pct / 100);
  });

  readonly attendanceTone = computed(() => {
    const pct = this.myAttendance()?.percentage ?? 0;
    if (pct >= 80) return 'good';
    if (pct >= 50) return 'mid';
    return 'low';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const timer = setInterval(() => this.currentTime.set(new Date()), 60_000);
    destroyRef.onDestroy(() => clearInterval(timer));

    // Rendu Blizzard du main, rechargé seulement quand le main change
    effect(() => {
      const main = this.mainCharacter();
      if (main) untracked(() => this.fetchCharacterDetails(main));
    });
  }

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.characterService.getMyCharacters().subscribe({
      next: (chars) => {
        this.myCharacters.set(chars);
        this.charactersLoaded.set(true);
        for (const c of chars) {
          this.characterService.getRioScore(c.name, c.realm).subscribe((score) => {
            this.rioScores.update((map) => new Map(map).set(this.rioKey(c), score));
          });
        }
      },
      error: () => this.charactersLoaded.set(true),
    });

    this.calendarService.getEvents().subscribe({
      next: (events) => {
        this.events.set(events);
        this.eventsLoaded.set(true);
      },
      error: () => this.eventsLoaded.set(true),
    });

    this.calendarService.getMySignups().subscribe((signups) => this.mySignups.set(signups));
    this.rosterService.getMyRoster().subscribe((roster) => this.myRoster.set(roster));

    const now = new Date();
    this.feeService.loadMyAllocations(now.getFullYear()).subscribe((allocs) => {
      this.myAllocations.set(allocs);
      // Les 3 mois affichés peuvent déborder sur l'année suivante (novembre, décembre)
      if (now.getMonth() >= 10) {
        this.feeService
          .loadMyAllocations(now.getFullYear() + 1)
          .subscribe((next) => this.myAllocations.update((cur) => [...cur, ...next]));
      }
    });

    this.authService.getGuildBirthdays().subscribe({
      next: (birthdays) => this.birthdays.set(birthdays),
      error: (err) => console.error('[Dashboard] Error loading guild birthdays', err),
    });

    this.authService.getAttendance().subscribe({
      next: (attendance) => this.myAttendance.set(attendance),
      error: (err) => console.error('[Dashboard] Error loading attendance', err),
    });
  }

  private fetchCharacterDetails(char: Character) {
    this.loadingDetails.set(true);
    this.characterService.getCharacterDetails(char.realm, char.name).subscribe({
      next: (details) => {
        this.charDetails.set(details);
        this.loadingDetails.set(false);
      },
      error: () => this.loadingDetails.set(false),
    });
  }

  private signupView(signup: Signup | undefined): { tone: SignupTone; label: string } {
    switch (signup?.status) {
      case 'signed_up':
        return { tone: 'success', label: this.i18n.t('dashboard.signed_up') };
      case 'standby':
        return { tone: 'warning', label: this.i18n.t('dashboard.standby') };
      case 'absent':
        return { tone: 'danger', label: this.i18n.t('dashboard.absent') };
      case undefined:
        return { tone: 'neutral', label: this.i18n.t('dashboard.unregistered') };
      default:
        return { tone: 'success', label: this.i18n.t('dashboard.signed_up') };
    }
  }

  private rioKey(c: Pick<Character, 'name' | 'realm'>): string {
    return `${c.name}-${c.realm}`.toLowerCase();
  }

  rioOf(c: Pick<Character, 'name' | 'realm'>): number | null {
    return this.rioScores().get(this.rioKey(c)) || null;
  }

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  attendanceLabel(att: Attendance): string {
    return this.i18n
      .t('dashboard.attendance.events_count')
      .replace('{attended}', String(att.attended))
      .replace('{eligible}', String(att.total_eligible));
  }

  isPresent(status: string | null): boolean {
    return status === 'signed_up' || status === 'standby';
  }
}
