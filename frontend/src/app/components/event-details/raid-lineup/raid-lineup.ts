import { Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CdkDrag, CdkDragDrop, CdkDropList, DragDropModule } from '@angular/cdk/drag-drop';
import { Observable } from 'rxjs';
import {
  CalendarEvent,
  CalendarService,
  effectiveRole,
  LineupEntry,
  LineupPatch,
  LineupSelection,
  playableRoles,
  RaidRole,
  Signup,
} from '../../../services/calendar';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import { computeBuffs } from '../composition/composition';
import { LineupCardComponent } from './lineup-card/lineup-card';
import { hasForcedRole, signupClassCss, signupDisplayName } from './lineup-utils';

/** Zone de dépôt : file d'attente, banc, ou colonne de rôle des validés. */
type LineupZone = 'pool' | 'bench' | RaidRole;

const RAID_ROLES: readonly RaidRole[] = ['tank', 'heal', 'dps'];
const ROLE_ORDER: Record<RaidRole, number> = { tank: 0, heal: 1, dps: 2 };

const ERROR_KEYS: Record<string, string> = {
  ROLE_NOT_PLAYABLE: 'event.lineup.error_role_not_playable',
  SIGNUP_ABSENT: 'event.lineup.error_signup_absent',
  EVENT_CANCELED: 'event.lineup.error_event_canceled',
};

@Component({
  selector: 'app-raid-lineup',
  standalone: true,
  imports: [DragDropModule, LineupCardComponent],
  templateUrl: './raid-lineup.html',
  styleUrl: './raid-lineup.css',
})
export class RaidLineupComponent {
  private calendarService = inject(CalendarService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  public i18n = inject(I18nService);

  event = input.required<CalendarEvent>();
  signups = input<Signup[]>([]);
  canManage = input(false);
  currentUserId = input<string | null>(null);

  /** États de line-up à fusionner dans les inscriptions (optimiste, confirmé ou rollback). */
  entriesChange = output<LineupEntry[]>();
  openAlts = output<Signup>();

  readonly roles = RAID_ROLES;
  readonly roleHeaderKeys: Record<RaidRole, string> = {
    tank: 'event.details.header_tanks',
    heal: 'event.details.header_heals',
    dps: 'event.details.header_dps',
  };
  readonly effectiveRole = effectiveRole;
  readonly classCss = signupClassCss;
  readonly hasForcedRole = hasForcedRole;
  /** Sur mobile, un appui long déclenche le drag pour ne pas bloquer le scroll. */
  readonly dragStartDelay = { touch: 250, mouse: 0 };

  private sheetUserId = signal<string | null>(null);
  /** Un relâché de drag peut déclencher un click sur la carte : on l'ignore. */
  private lastDragEndedAt = 0;

  private available = computed(() => this.signups().filter((s) => s.status !== 'absent'));

  pool = computed(() =>
    this.available()
      .filter((s) => !s.selection)
      .sort(
        (a, b) =>
          ROLE_ORDER[effectiveRole(a)] - ROLE_ORDER[effectiveRole(b)] ||
          this.displayName(a).localeCompare(this.displayName(b)),
      ),
  );

  selectedByRole = computed(() => {
    const byRole: Record<RaidRole, Signup[]> = { tank: [], heal: [], dps: [] };
    for (const s of this.available()) {
      if (s.selection === 'selected') byRole[effectiveRole(s)]?.push(s);
    }
    for (const role of RAID_ROLES) byRole[role].sort(this.byName);
    return byRole;
  });

  bench = computed(() =>
    this.available()
      .filter((s) => s.selection === 'benched')
      .sort(this.byName),
  );

  selectedCount = computed(() =>
    RAID_ROLES.reduce((n, r) => n + this.selectedByRole()[r].length, 0),
  );
  decidedUserIds = computed(() =>
    this.available()
      .filter((s) => !!s.selection)
      .map((s) => s.user_id),
  );

  /** Buffs de tous les joueurs non mis sur le banc : l'impact d'un banc est visible immédiatement. */
  buffs = computed(() => computeBuffs(this.available().filter((s) => s.selection !== 'benched')));

  sheetSignup = computed(() => {
    const userId = this.sheetUserId();
    return userId ? (this.available().find((s) => s.user_id === userId) ?? null) : null;
  });
  sheetPlayableRoles = computed(() => {
    const signup = this.sheetSignup();
    return signup ? playableRoles(signup) : new Set<RaidRole>();
  });

  // --- Affichage -----------------------------------------------------------

  displayName(s: Signup): string {
    return signupDisplayName(s) ?? this.i18n.t('event.details.unknown_user');
  }

  roleLabel(role: string): string {
    return this.i18n.t('event.details.role_' + role);
  }

  signedAsLabel(s: Signup): string {
    return this.i18n.t('event.lineup.signed_as').replace('{role}', this.roleLabel(s.role));
  }

  isMe(s: Signup): boolean {
    return !!this.currentUserId() && s.user_id === this.currentUserId();
  }

  // --- Interactions ----------------------------------------------------------

  onDragEnded(): void {
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeSheet();
  }

  viewCharacters(s: Signup): void {
    this.closeSheet();
    this.openAlts.emit(s);
  }

  setSelection(s: Signup, selection: LineupSelection): void {
    if ((s.selection ?? null) === selection) return;
    this.updateEntry(s, { selection });
  }

  assignRole(s: Signup, role: RaidRole): void {
    if (effectiveRole(s) === role || !playableRoles(s).has(role)) return;
    // Revenir au rôle choisi par le joueur = pas de rôle imposé
    this.updateEntry(s, { assigned_role: role === s.role ? null : role });
  }

  /** Empêche de survoler une colonne de rôle que le personnage ne peut pas jouer. */
  canEnter = (drag: CdkDrag<Signup>, drop: CdkDropList<string>): boolean => {
    const zone = drop.data as LineupZone;
    return zone === 'pool' || zone === 'bench' || playableRoles(drag.data).has(zone);
  };

  /** `cdkDropListData` porte l'identifiant de la zone (LineupZone). */
  onDrop<Z extends string>(drop: CdkDragDrop<Z, unknown, Signup>): void {
    if (drop.previousContainer === drop.container) return;
    const s = drop.item.data;
    const zone = drop.container.data as LineupZone;

    if (zone === 'pool') return this.setSelection(s, null);
    if (zone === 'bench') return this.setSelection(s, 'benched');

    const patch: LineupPatch = { selection: 'selected' };
    if (effectiveRole(s) !== zone) patch.assigned_role = zone === s.role ? null : zone;
    this.updateEntry(s, patch);
  }

  selectAllPending(): void {
    const targets = this.pool();
    if (targets.length === 0) return;
    this.bulkUpdate(targets, 'selected', () =>
      this.toast.success(
        this.i18n.t('event.lineup.toast_bulk_selected').replace('{count}', String(targets.length)),
      ),
    );
  }

  async resetAll(): Promise<void> {
    const ids = new Set(this.decidedUserIds());
    if (ids.size === 0) return;
    const ok = await this.confirm.ask(
      this.i18n.t('event.lineup.confirm_reset_title'),
      this.i18n.t('event.lineup.confirm_reset_desc'),
    );
    if (!ok) return;
    const targets = this.available().filter((s) => ids.has(s.user_id));
    this.bulkUpdate(targets, null, () =>
      this.toast.success(this.i18n.t('event.lineup.toast_reset')),
    );
  }

  // --- Persistance -------------------------------------------------------------

  private updateEntry(s: Signup, patch: LineupPatch): void {
    const optimistic: LineupEntry = { ...toEntry(s), ...patch };
    this.commit(
      [s],
      [optimistic],
      this.calendarService.updateLineupEntry(this.eventId(), s.user_id, patch),
    );
  }

  private bulkUpdate(targets: Signup[], selection: LineupSelection, onSuccess: () => void): void {
    const request$ = this.calendarService.bulkUpdateLineup(
      this.eventId(),
      targets.map((s) => s.user_id),
      selection,
    );
    this.commit(
      targets,
      targets.map((s) => ({ ...toEntry(s), selection })),
      request$,
      onSuccess,
    );
  }

  /** Mise à jour optimiste, puis état serveur en cas de succès ou rollback en cas d'erreur. */
  private commit(
    targets: Signup[],
    optimistic: LineupEntry[],
    request$: Observable<LineupEntry | LineupEntry[]>,
    onSuccess?: () => void,
  ): void {
    const rollback = targets.map(toEntry);
    this.entriesChange.emit(optimistic);
    request$.subscribe({
      next: (res) => {
        this.entriesChange.emit(Array.isArray(res) ? res : [res]);
        onSuccess?.();
      },
      error: (err: HttpErrorResponse) => {
        this.entriesChange.emit(rollback);
        this.toast.error(this.i18n.t(ERROR_KEYS[err.error?.code] ?? 'event.lineup.error_generic'));
      },
    });
  }

  private eventId(): string {
    return this.event().id!;
  }

  private byName = (a: Signup, b: Signup): number =>
    this.displayName(a).localeCompare(this.displayName(b));
}

function toEntry(s: Signup): LineupEntry {
  return {
    user_id: s.user_id,
    role: s.role as RaidRole,
    selection: s.selection ?? null,
    assigned_role: s.assigned_role ?? null,
  };
}
