import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  CalendarEvent,
  CalendarService,
  LineupEntry,
  MplusGroupsState,
  Signup,
} from '../../services/calendar';
import { Character, CharacterService } from '../../services/character';
import { Roster, RosterService } from '../../services/roster';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { I18nService } from '../../services/i18n';
import { eventTypeKey } from '../../utils/event-type';
import { formatCountdown } from '../dashboard/dashboard-utils';
import { EventFormModalComponent } from '../calendar/event-form-modal/event-form-modal';
import { ParticipantsComponent } from './participants/participants';
import { CompositionComponent } from './composition/composition';
import { LogsDashboardComponent } from './logs-dashboard/logs-dashboard';
import { RaidLineupComponent } from './raid-lineup/raid-lineup';
import { MplusGroupsComponent } from './mplus-groups/mplus-groups';
import { LineupStatusComponent } from './raid-lineup/lineup-status/lineup-status';

type Tab = 'participants' | 'composition' | 'logs';
type Modal = 'edit' | 'cancel' | 'alts' | null;

@Component({
  selector: 'app-event-details',
  imports: [
    DatePipe,
    RouterModule,
    FormsModule,
    EventFormModalComponent,
    LogsDashboardComponent,
    ParticipantsComponent,
    CompositionComponent,
    RaidLineupComponent,
    MplusGroupsComponent,
    LineupStatusComponent,
  ],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class EventDetailsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly calendarService = inject(CalendarService);
  private readonly rosterService = inject(RosterService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly i18n = inject(I18nService);
  readonly authService = inject(AuthService);
  readonly characterService = inject(CharacterService);

  readonly event = signal<CalendarEvent | null>(null);
  readonly notFound = signal(false);
  readonly signups = signal<Signup[]>([]);
  readonly rioScores = signal<ReadonlyMap<string, number>>(new Map());
  readonly myCharacters = signal<Character[]>([]);
  readonly rosters = signal<Roster[]>([]);
  readonly activeTab = signal<Tab>('participants');
  readonly now = signal(new Date());

  readonly modal = signal<Modal>(null);
  readonly selectedSignup = signal<Signup | null>(null);
  readonly busy = signal(false);
  cancelReason = '';
  readonly roles = ['tank', 'heal', 'dps'] as const;

  readonly canManageEvents = computed(() => this.authService.canManageEvents());
  readonly canManageLineup = computed(() => this.authService.canManageLineup());
  readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);

  readonly typeKey = computed(() => eventTypeKey(this.event()?.type));
  readonly isRaid = computed(() => this.event()?.type?.toLowerCase() === 'raid');
  readonly isMplus = computed(() => this.event()?.type?.toLowerCase() === 'mm+');
  readonly hasLogs = computed(() => this.isRaid() && !!this.event()?.logs);

  readonly typeLabel = computed(() => {
    const evt = this.event();
    if (!evt) return '';
    return this.typeKey() === 'reunion' ? this.i18n.t('calendar.form.type_reunion') : evt.type;
  });

  readonly audienceLabel = computed(() => {
    const evt = this.event();
    if (!evt) return '';
    if (this.typeKey() === 'reunion') {
      const groups = evt.invited_groups ?? [];
      return !groups.length || groups.includes('all')
        ? this.i18n.t('calendar.form.all_members')
        : groups.map((g) => this.i18n.t(`calendar.form.role_${g}`)).join(', ');
    }
    return evt.roster_name || this.i18n.t('calendar.tag_all');
  });

  /** Durée « 2h », « 1h30 ». */
  readonly duration = computed(() => {
    const evt = this.event();
    if (!evt?.end_time) return null;
    const minutes = Math.round(
      (new Date(evt.end_time).getTime() - new Date(evt.start_time).getTime()) / 60_000,
    );
    if (minutes <= 0) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
  });

  /** État temporel : à venir (compte à rebours), en cours, terminé. */
  readonly timing = computed(() => {
    const evt = this.event();
    if (!evt) return null;
    const now = this.now();
    const end = new Date(evt.end_time || evt.start_time).getTime();
    if (now.getTime() > end)
      return { state: 'done' as const, label: this.i18n.t('event.details.state_done') };
    const countdown = formatCountdown(evt.start_time, now, this.i18n.t('dashboard.days_short'));
    if (!countdown.label)
      return { state: 'live' as const, label: this.i18n.t('dashboard.in_progress') };
    return {
      state: countdown.soon ? ('soon' as const) : ('upcoming' as const),
      label: this.i18n.t('event.details.starts_in').replace('{time}', countdown.label),
    };
  });

  readonly attendingCount = computed(
    () => this.signups().filter((s) => s.status !== 'absent').length,
  );

  /** Inscription du joueur connecté, si elle est concernée par le line-up (raid actif, non absent). */
  readonly myLineupSignup = computed(() => {
    const evt = this.event();
    if (!this.isRaid() || evt?.is_canceled) return null;
    const mine = this.signups().find((s) => s.user_id === this.currentUserId());
    return mine && mine.status !== 'absent' ? mine : null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    destroyRef.onDestroy(() => clearInterval(timer));

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.activeTab.set('participants');
      this.event.set(null);
      this.notFound.set(false);
      this.signups.set([]);
      this.loadEvent(id);
      this.loadSignups(id);
    });

    this.characterService.getMyCharacters().subscribe((chars) => this.myCharacters.set(chars));
    this.rosterService.loadRosters().subscribe((rosters) => this.rosters.set(rosters));
  }

  private loadEvent(id: string) {
    this.calendarService.getEvent(id).subscribe({
      next: (event) => this.event.set(event),
      error: () => this.notFound.set(true),
    });
  }

  private loadSignups(id: string) {
    this.calendarService.getSignups(id).subscribe((signups) => {
      this.signups.set(signups);
      const known = this.rioScores();
      for (const s of signups) {
        const name = s.character_name || s.main_character_name;
        const realm = s.character_realm || s.main_character_realm;
        if (!name || !realm) continue;
        const key = `${name}-${realm}`.toLowerCase();
        if (known.has(key)) continue;
        this.characterService.getRioScore(name, realm).subscribe((score) => {
          this.rioScores.update((map) => new Map(map).set(key, score));
        });
      }
    });
  }

  onReloadSignups() {
    const id = this.event()?.id;
    if (!id) return;
    this.loadSignups(id);
    this.loadEvent(id);
  }

  onEscape() {
    // La modale d'édition gère sa propre touche Échap
    if (this.modal() && this.modal() !== 'edit') this.closeModal();
  }

  closeModal() {
    this.modal.set(null);
    this.busy.set(false);
  }

  // ---------- Actions gestionnaire ----------

  onUpdateEvent(payload: CalendarEvent) {
    const id = this.event()?.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.calendarService.updateEvent(id, payload).subscribe({
      next: () => {
        this.loadEvent(id);
        this.closeModal();
        this.toast.success(this.i18n.t('event.details.toast_update_success'));
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err?.error?.message || this.i18n.t('event.details.toast_update_error'));
      },
    });
  }

  async onDeleteEvent() {
    const evt = this.event();
    if (!evt?.id) return;
    const ok = await this.confirm.ask(
      this.i18n.t('event.details.confirm_delete_title'),
      this.i18n.t('event.details.confirm_delete_desc'),
      undefined,
      undefined,
      true,
    );
    if (!ok) return;
    this.calendarService.deleteEvent(evt.id).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('event.details.toast_delete_success'));
        this.router.navigate(['/calendar']);
      },
      error: () => this.toast.error(this.i18n.t('event.details.toast_delete_error')),
    });
  }

  openCancel() {
    this.cancelReason = '';
    this.modal.set('cancel');
  }

  confirmCancelEvent() {
    const evt = this.event();
    if (!evt?.id || this.busy()) return;
    this.busy.set(true);
    this.calendarService.cancelEvent(evt.id, this.cancelReason.trim()).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('event.details.toast_cancel_success'));
        this.loadEvent(evt.id!);
        this.closeModal();
      },
      error: () => {
        this.busy.set(false);
        this.toast.error(this.i18n.t('event.details.toast_cancel_error'));
      },
    });
  }

  onToggleRegistrationLock() {
    const evt = this.event();
    if (!evt?.id) return;
    // Bascule optimiste, annulée si l'API refuse
    const locked = !evt.registrations_locked;
    this.event.set({ ...evt, registrations_locked: locked });
    this.calendarService.toggleRegistrationLock(evt.id).subscribe({
      next: (updated) => {
        this.event.update((cur) =>
          cur ? { ...cur, registrations_locked: updated.registrations_locked } : cur,
        );
        this.toast.success(
          this.i18n.t(
            updated.registrations_locked
              ? 'event.details.toast_lock_success'
              : 'event.details.toast_unlock_success',
          ),
        );
      },
      error: () => {
        this.event.update((cur) => (cur ? { ...cur, registrations_locked: !locked } : cur));
        this.toast.error(this.i18n.t('event.details.toast_lock_error'));
      },
    });
  }

  async onRemindEvent() {
    const evt = this.event();
    if (!evt?.id) return;
    const ok = await this.confirm.ask(
      this.i18n.t('event.details.confirm_remind_title'),
      this.i18n.t('event.details.confirm_remind_desc').replace('{eventTitle}', evt.title),
    );
    if (!ok) return;
    this.calendarService.remindEvent(evt.id).subscribe({
      next: () => this.toast.success(this.i18n.t('event.details.toast_remind_success')),
      error: () => this.toast.error(this.i18n.t('event.details.toast_remind_error')),
    });
  }

  // ---------- Personnages d'un joueur ----------

  onOpenAltsModal(signup: Signup) {
    this.selectedSignup.set(signup);
    this.modal.set('alts');
  }

  isSelectedCharacterAndRole(characterId: string, role: string): boolean {
    const signup = this.selectedSignup();
    return !!signup && signup.character_id === characterId && signup.role === role;
  }

  onAdminUpdateSignup(characterId: string, role: string) {
    const signup = this.selectedSignup();
    const evt = this.event();
    if (!signup || !evt?.id || this.busy()) return;
    this.busy.set(true);
    this.calendarService
      .updateSignup(evt.id, signup.user_id, { character_id: characterId, role })
      .subscribe({
        next: () => {
          this.toast.success(this.i18n.t('event.details.toast_signup_updated_success'));
          this.closeModal();
          this.onReloadSignups();
        },
        error: (err) => {
          this.busy.set(false);
          console.error('[EventDetails] Admin update signup error', err);
          this.toast.error(this.i18n.t('event.details.toast_signup_updated_error'));
        },
      });
  }

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  rioOf(name: string | undefined, realm: string | undefined): number | null {
    if (!name || !realm) return null;
    return this.rioScores().get(`${name}-${realm}`.toLowerCase()) || null;
  }

  // ---------- Composition ----------

  /** Groupes M+ confirmés par le serveur : pas besoin de recharger l'événement ni les inscriptions. */
  onMplusStateChange(state: MplusGroupsState) {
    const byUser = new Map(state.assignments.map((a) => [a.user_id, a.group_index]));
    this.event.update((evt) => (evt ? { ...evt, mm_groups_count: state.mm_groups_count } : evt));
    this.signups.update((list) =>
      list.map((s) => (byUser.has(s.user_id) ? { ...s, group_index: byUser.get(s.user_id)! } : s)),
    );
  }

  onLineupEntriesChange(entries: LineupEntry[]) {
    const byUser = new Map(entries.map((e) => [e.user_id, e]));
    this.signups.update((list) =>
      list.map((s) => {
        const entry = byUser.get(s.user_id);
        return entry ? { ...s, selection: entry.selection, assigned_role: entry.assigned_role } : s;
      }),
    );
  }
}
