import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CalendarEvent,
  CalendarService,
  RaidRole,
  Signup,
  effectiveRole,
} from '../../../services/calendar';
import { Character, CharacterService } from '../../../services/character';
import { Roster } from '../../../services/roster';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';
import {
  SignupStatus,
  SortDirection,
  SortMethod,
  countSignups,
  defaultRoleFor,
  isCharacterAllowed,
  signupClass,
  signupDisplayName,
  sortSignups,
} from './participants-utils';

type StatusFilter = 'all' | SignupStatus;

@Component({
  selector: 'app-participants',
  imports: [DatePipe, FormsModule, RouterModule],
  templateUrl: './participants.html',
  styleUrl: './participants.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantsComponent {
  private readonly calendarService = inject(CalendarService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly i18n = inject(I18nService);

  readonly event = input<CalendarEvent | null>(null);
  readonly signups = input<Signup[]>([]);
  readonly myCharacters = input<Character[]>([]);
  readonly rosters = input<Roster[]>([]);
  readonly canManageEvents = input(false);
  readonly rioScores = input<ReadonlyMap<string, number>>(new Map());
  readonly currentUserId = input<string | null>(null);

  readonly signupChanged = output<void>();
  readonly openAlts = output<Signup>();

  readonly roles: RaidRole[] = ['tank', 'heal', 'dps'];
  readonly statuses: SignupStatus[] = ['signed_up', 'standby', 'absent'];
  readonly effectiveRole = effectiveRole;

  // ---------- Liste ----------
  readonly sortMethod = signal<SortMethod>('date');
  readonly sortDirection = signal<SortDirection>('asc');
  readonly statusFilter = signal<StatusFilter>('all');

  readonly isRaid = computed(() => this.event()?.type?.toLowerCase() === 'raid');
  readonly counts = computed(() => countSignups(this.signups(), effectiveRole));

  readonly sortedSignups = computed(() => {
    const filter = this.statusFilter();
    const list =
      filter === 'all' ? this.signups() : this.signups().filter((s) => s.status === filter);
    return sortSignups(list, this.sortMethod(), this.sortDirection());
  });

  // ---------- Formulaire d'inscription ----------
  readonly mySignup = computed(
    () => this.signups().find((s) => s.user_id === this.currentUserId()) ?? null,
  );

  readonly allowedCharacters = computed(() => this.myCharacters().filter((c) => this.isAllowed(c)));

  private readonly defaultCharacter = computed(() => {
    const allowed = this.allowedCharacters();
    return allowed.find((c) => c.is_main) ?? allowed[0];
  });

  /** Valeurs initiales reprises de l'inscription existante, réinitialisées quand elle change. */
  readonly status = linkedSignal<SignupStatus>(
    () => (this.mySignup()?.status as SignupStatus) ?? 'signed_up',
  );
  readonly characterId = linkedSignal(
    () => this.mySignup()?.character_id || this.defaultCharacter()?.id || '',
  );
  readonly role = linkedSignal<RaidRole>(
    () =>
      (this.mySignup()?.role as RaidRole) ??
      defaultRoleFor(this.myCharacters().find((c) => c.id === this.characterId())),
  );
  readonly comment = linkedSignal(() => this.mySignup()?.comment ?? '');

  readonly saving = signal(false);

  readonly isPast = computed(() => {
    const evt = this.event();
    return !!evt && new Date(evt.start_time).getTime() < Date.now();
  });

  readonly readOnly = computed(() => this.isPast() || !!this.event()?.registrations_locked);

  readonly selectedCharacter = computed(() =>
    this.myCharacters().find((c) => c.id === this.characterId()),
  );

  readonly isSignupDisabled = computed(() => {
    if (!this.event() || this.readOnly() || this.saving()) return true;
    if (this.status() === 'absent') return false;
    const char = this.selectedCharacter();
    return !char || !this.isAllowed(char);
  });

  /** Le formulaire diffère-t-il de l'inscription enregistrée ? */
  readonly isDirty = computed(() => {
    const mine = this.mySignup();
    if (!mine) return true;
    return (
      mine.status !== this.status() ||
      (this.status() !== 'absent' &&
        ((mine.character_id || '') !== this.characterId() || mine.role !== this.role())) ||
      (mine.comment ?? '') !== this.comment()
    );
  });

  isAllowed(char: Character): boolean {
    return isCharacterAllowed(char, this.event(), this.rosters());
  }

  selectCharacter(char: Character) {
    if (!this.isAllowed(char) || this.readOnly()) return;
    this.characterId.set(char.id ?? '');
    this.role.set(defaultRoleFor(char));
  }

  setStatus(status: SignupStatus) {
    this.status.set(status);
    if (status !== 'absent' && !this.characterId()) {
      const char = this.defaultCharacter();
      if (char) this.selectCharacter(char);
    }
  }

  canPlay(role: RaidRole): boolean {
    const char = this.selectedCharacter();
    if (!char) return true;
    return role === 'tank' ? !!char.is_tank : role === 'heal' ? !!char.is_heal : !!char.is_dps;
  }

  onSignup() {
    const evt = this.event();
    if (!evt?.id || this.isSignupDisabled()) return;
    const absent = this.status() === 'absent';
    this.saving.set(true);
    this.calendarService
      .signup(evt.id, {
        character_id: absent ? null : this.characterId(),
        role: this.role(),
        status: this.status(),
        comment: this.comment().trim(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.signupChanged.emit();
          this.toast.success(this.i18n.t('event.details.toast_signup_success'));
        },
        error: (err) => {
          this.saving.set(false);
          console.error('[Participants] Signup error', err);
          this.toast.error(err?.error?.message || this.i18n.t('event.details.toast_signup_error'));
        },
      });
  }

  async onUnsignup() {
    const evt = this.event();
    if (!evt?.id || this.readOnly()) return;
    const ok = await this.confirm.ask(
      this.i18n.t('event.details.confirm_unsignup_title'),
      this.i18n.t('event.details.confirm_unsignup_desc'),
    );
    if (!ok) return;
    this.saving.set(true);
    this.calendarService.unsignup(evt.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.signupChanged.emit();
        this.toast.success(this.i18n.t('event.details.toast_unsignup_success'));
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.i18n.t('event.details.toast_signup_error'));
      },
    });
  }

  toggleDateSort() {
    if (this.sortMethod() === 'date') {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortMethod.set('date');
      this.sortDirection.set('asc');
    }
  }

  displayName(s: Signup): string {
    return signupDisplayName(s, this.i18n.t('event.details.unknown_user'));
  }

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  signupClassId(s: Signup): string {
    return CharacterService.getClassId(signupClass(s));
  }

  signupIcon(s: Signup): string {
    return CharacterService.getClassIcon(signupClass(s));
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  rioOf(s: Signup): number | null {
    const name = s.character_name || s.main_character_name;
    const realm = s.character_realm || s.main_character_realm;
    if (!name || !realm) return null;
    return this.rioScores().get(`${name}-${realm}`.toLowerCase()) || null;
  }

  statusLabel(status: string): string {
    const key = { signed_up: 'status_present', standby: 'status_maybe', absent: 'status_absent' }[
      status
    ];
    return this.i18n.t(`event.details.${key ?? 'status_present'}`);
  }

  roleLabel(role: string): string {
    return this.i18n.t(`event.details.role_${role}`);
  }
}
