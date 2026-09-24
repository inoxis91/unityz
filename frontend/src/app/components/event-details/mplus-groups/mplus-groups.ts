import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Observable } from 'rxjs';
import {
  CalendarEvent,
  CalendarService,
  GroupAssignment,
  MplusGroupsState,
  RaidRole,
  Signup,
} from '../../../services/calendar';
import { CharacterService } from '../../../services/character';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import { signupClassCss, signupDisplayName } from '../raid-lineup/lineup-utils';
import { MplusGroupCardComponent } from './mplus-group-card/mplus-group-card';
import { MplusPlayerCardComponent } from './mplus-player-card/mplus-player-card';
import {
  autoFill,
  buildGroup,
  byRoleThenScore,
  formatForDiscord,
  MPLUS_GROUP_SIZE,
  MPLUS_MAX_GROUPS,
  MPLUS_ROLES,
  MplusGroup,
  possibleGroups,
  rioKey,
  ScoreFn,
} from './mplus-utils';

type RoleFilter = RaidRole | 'all';

const ERROR_KEYS: Record<string, string> = {
  GROUP_FULL: 'event.mplus.error_group_full',
  GROUP_LIMIT: 'event.mplus.error_group_limit',
  GROUP_NOT_FOUND: 'event.mplus.error_stale',
  SIGNUP_ABSENT: 'event.lineup.error_signup_absent',
  EVENT_CANCELED: 'event.lineup.error_event_canceled',
};

/** Composition des groupes d'une sortie Mythique+ (drag & drop, remplissage automatique, export). */
@Component({
  selector: 'app-mplus-groups',
  imports: [DragDropModule, MplusGroupCardComponent, MplusPlayerCardComponent],
  templateUrl: './mplus-groups.html',
  styleUrl: './mplus-groups.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeSheet()' },
})
export class MplusGroupsComponent {
  private calendarService = inject(CalendarService);
  private characterService = inject(CharacterService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private injector = inject(Injector);
  public i18n = inject(I18nService);

  event = input.required<CalendarEvent>();
  signups = input<Signup[]>([]);
  rioScores = input<Map<string, number>>(new Map());
  canManage = input(false);
  currentUserId = input<string | null>(null);

  /** État confirmé par le serveur, à répercuter sur l'événement et les inscriptions. */
  stateChange = output<MplusGroupsState>();
  openAlts = output<Signup>();

  readonly roles = MPLUS_ROLES;
  readonly maxGroups = MPLUS_MAX_GROUPS;
  readonly groupSize = MPLUS_GROUP_SIZE;
  /** Sur mobile, un appui long déclenche le drag pour ne pas bloquer le scroll. */
  readonly dragStartDelay = { touch: 250, mouse: 0 };

  /** État local, mis à jour de façon optimiste puis remplacé par la réponse du serveur. */
  private state = linkedSignal<MplusGroupsState>(() => ({
    mm_groups_count: this.event().mm_groups_count ?? 0,
    assignments: this.signups().map((s) => ({
      user_id: s.user_id,
      group_index: s.group_index ?? 0,
    })),
  }));

  roleFilter = signal<RoleFilter>('all');
  draggingRole = signal<RaidRole | null>(null);
  addingGroup = signal(false);
  highlightedGroup = signal<number | null>(null);
  private sheetUserId = signal<string | null>(null);
  /** Un relâché de drag peut déclencher un click sur la carte : on l'ignore. */
  private lastDragEndedAt = 0;
  /**
   * Clés d'affichage stables par position : les groupes sont renumérotés à la suppression,
   * c'est ainsi la carte supprimée (et non la dernière) qui joue l'animation de sortie.
   */
  private groupKeys: number[] = [];
  private nextGroupKey = 0;

  readonly scoreOf: ScoreFn = (s) => {
    const key = rioKey(s);
    return key ? (this.rioScores().get(key) ?? null) : null;
  };

  private players = computed(() => this.signups().filter((s) => s.status !== 'absent'));
  groupsCount = computed(() => this.state().mm_groups_count);

  private groupIndexOf = computed(() => {
    const count = this.groupsCount();
    const map = new Map<string, number>();
    for (const a of this.state().assignments) {
      map.set(a.user_id, a.group_index >= 1 && a.group_index <= count ? a.group_index : 0);
    }
    return map;
  });

  groups = computed<MplusGroup[]>(() => {
    const byGroup = new Map<number, Signup[]>();
    for (const p of this.players()) {
      const index = this.groupIndexOf().get(p.user_id) ?? 0;
      if (index) byGroup.set(index, [...(byGroup.get(index) ?? []), p]);
    }
    return Array.from({ length: this.groupsCount() }, (_, i) =>
      buildGroup(i + 1, byGroup.get(i + 1) ?? [], this.scoreOf),
    );
  });

  pool = computed(() =>
    this.players()
      .filter((p) => !this.groupIndexOf().get(p.user_id))
      .sort(byRoleThenScore(this.scoreOf)),
  );

  filteredPool = computed(() => {
    const filter = this.roleFilter();
    return filter === 'all' ? this.pool() : this.pool().filter((p) => p.role === filter);
  });

  poolByRole = computed(() => {
    const counts: Record<RaidRole, number> = { tank: 0, heal: 0, dps: 0 };
    for (const p of this.pool()) counts[p.role as RaidRole]++;
    return counts;
  });

  stats = computed(() => {
    const groups = this.groups();
    return {
      players: this.players().length,
      placed: this.players().length - this.pool().length,
      ready: groups.filter((g) => g.isComplete).length,
      groups: groups.length,
      possible: possibleGroups(this.pool()),
    };
  });

  freeSlots = computed(() =>
    this.groups().reduce((n, g) => n + Math.max(0, MPLUS_GROUP_SIZE - g.members.length), 0),
  );

  sheetSignup = computed(() => {
    const userId = this.sheetUserId();
    return userId ? (this.players().find((s) => s.user_id === userId) ?? null) : null;
  });
  sheetGroupIndex = computed(() => {
    const s = this.sheetSignup();
    return s ? (this.groupIndexOf().get(s.user_id) ?? 0) : 0;
  });

  // --- Affichage -----------------------------------------------------------

  displayName(s: Signup): string {
    return signupDisplayName(s) ?? this.i18n.t('event.details.unknown_user');
  }

  classCss(s: Signup): string {
    return signupClassCss(s);
  }

  roleLabel(role: string): string {
    return this.i18n.t('event.details.role_' + role);
  }

  groupKey(position: number): number {
    while (this.groupKeys.length <= position) this.groupKeys.push(this.nextGroupKey++);
    return this.groupKeys[position];
  }

  groupTitle(index: number): string {
    return this.i18n.t('event.mplus.group_title').replace('{index}', String(index));
  }

  raiderIoUrl(s: Signup): string {
    return this.characterService.getRaiderIoUrl(
      s.character_name || s.main_character_name,
      s.character_realm || s.main_character_realm,
    );
  }

  // --- Interactions ----------------------------------------------------------

  onDragStarted(s: Signup): void {
    this.draggingRole.set(s.role as RaidRole);
  }

  onDragEnded(): void {
    this.draggingRole.set(null);
    this.lastDragEndedAt = Date.now();
  }

  onCardActivate(s: Signup): void {
    if (Date.now() - this.lastDragEndedAt < 300) return;
    if (this.canManage()) this.sheetUserId.set(s.user_id);
    else this.openAlts.emit(s);
  }

  closeSheet(): void {
    this.sheetUserId.set(null);
  }

  viewCharacters(s: Signup): void {
    this.closeSheet();
    this.openAlts.emit(s);
  }

  /** `cdkDropListData` porte l'index du groupe (0 = sans groupe). */
  onDrop(drop: CdkDragDrop<number, unknown, Signup>): void {
    if (drop.previousContainer === drop.container) return;
    this.move(drop.item.data, drop.container.data);
  }

  move(s: Signup, groupIndex: number): void {
    if ((this.groupIndexOf().get(s.user_id) ?? 0) === groupIndex) return;
    const target = this.groups()[groupIndex - 1];
    if (target?.isFull) {
      this.toast.error(this.i18n.t('event.mplus.error_group_full'));
      return;
    }
    this.commit(
      withAssignments(this.state(), [{ user_id: s.user_id, group_index: groupIndex }]),
      this.calendarService.moveToMplusGroup(this.eventId(), s.user_id, groupIndex),
    );
  }

  addGroup(): void {
    const count = this.groupsCount();
    if (count >= MPLUS_MAX_GROUPS || this.addingGroup()) return;
    this.addingGroup.set(true);
    this.commit(
      { ...this.state(), mm_groups_count: count + 1 },
      this.calendarService.addMplusGroup(this.eventId()),
      () => this.revealGroup(count + 1),
      () => this.addingGroup.set(false),
    );
  }

  async removeGroup(group: MplusGroup): Promise<void> {
    if (group.members.length) {
      const ok = await this.confirm.ask(
        this.i18n
          .t('event.mplus.confirm_delete_title')
          .replace('{group}', this.groupTitle(group.index)),
        this.i18n.t('event.mplus.confirm_delete_desc'),
      );
      if (!ok) return;
    }
    this.groupKeys.splice(group.index - 1, 1);
    const current = this.state();
    const optimistic: MplusGroupsState = {
      mm_groups_count: current.mm_groups_count - 1,
      assignments: current.assignments.map((a) => ({
        ...a,
        group_index:
          a.group_index === group.index
            ? 0
            : a.group_index > group.index
              ? a.group_index - 1
              : a.group_index,
      })),
    };
    this.commit(optimistic, this.calendarService.deleteMplusGroup(this.eventId(), group.index));
  }

  autoFill(): void {
    const assignments = autoFill(this.groups(), this.pool(), this.scoreOf);
    if (!assignments.length) {
      this.toast.error(this.i18n.t('event.mplus.toast_autofill_none'));
      return;
    }
    this.commit(
      withAssignments(this.state(), assignments),
      this.calendarService.setMplusAssignments(this.eventId(), assignments),
      () =>
        this.toast.success(
          this.i18n.t('event.mplus.toast_autofill').replace('{count}', String(assignments.length)),
        ),
    );
  }

  async resetAll(): Promise<void> {
    const placed = this.players().filter((p) => this.groupIndexOf().get(p.user_id));
    if (!placed.length) return;
    const ok = await this.confirm.ask(
      this.i18n.t('event.mplus.confirm_reset_title'),
      this.i18n.t('event.mplus.confirm_reset_desc'),
    );
    if (!ok) return;
    const assignments = placed.map((p) => ({ user_id: p.user_id, group_index: 0 }));
    this.commit(
      withAssignments(this.state(), assignments),
      this.calendarService.setMplusAssignments(this.eventId(), assignments),
    );
  }

  async copyForDiscord(): Promise<void> {
    const text = formatForDiscord(this.event().title, this.groups(), {
      group: (index) => this.groupTitle(index),
      average: this.i18n.t('event.mplus.average'),
    });
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(this.i18n.t('event.mplus.toast_copied'));
    } catch {
      this.toast.error(this.i18n.t('event.mplus.toast_copy_error'));
    }
  }

  // --- Persistance -------------------------------------------------------------

  /** Mise à jour optimiste, puis état serveur en cas de succès ou rollback en cas d'erreur. */
  private commit(
    optimistic: MplusGroupsState,
    request$: Observable<MplusGroupsState>,
    onSuccess?: () => void,
    onSettled?: () => void,
  ): void {
    const rollback = this.state();
    this.state.set(optimistic);
    request$.subscribe({
      next: (server) => {
        this.state.set(server);
        this.stateChange.emit(server);
        onSettled?.();
        onSuccess?.();
      },
      error: (err: HttpErrorResponse) => {
        this.state.set(rollback);
        onSettled?.();
        this.toast.error(this.i18n.t(ERROR_KEYS[err.error?.code] ?? 'event.mplus.error_generic'));
      },
    });
  }

  /** Fait défiler jusqu'au groupe créé et le met en évidence un instant. */
  private revealGroup(index: number): void {
    this.highlightedGroup.set(index);
    afterNextRender(
      () =>
        document
          .getElementById(`mp-group-${index}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      { injector: this.injector },
    );
    setTimeout(() => {
      if (this.highlightedGroup() === index) this.highlightedGroup.set(null);
    }, 1600);
  }

  private eventId(): string {
    return this.event().id!;
  }
}

function withAssignments(state: MplusGroupsState, changes: GroupAssignment[]): MplusGroupsState {
  const byUser = new Map(changes.map((c) => [c.user_id, c.group_index]));
  return {
    ...state,
    assignments: state.assignments.map((a) =>
      byUser.has(a.user_id) ? { ...a, group_index: byUser.get(a.user_id)! } : a,
    ),
  };
}
