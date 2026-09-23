import { Component, OnInit, signal, inject, computed, HostListener } from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { RosterService, Roster, RosterRole } from '../../../services/roster';
import { CharacterService, Character } from '../../../services/character';
import { ConfirmService } from '../../../services/confirm';
import { ToastService } from '../../../services/toast';
import { AuthService } from '../../../services/auth';
import { I18nService } from '../../../services/i18n';

type RoleBuckets = Record<RosterRole, Character[]>;

const CONTEXT_MENU_WIDTH = 230;
const CONTEXT_MENU_MAX_HEIGHT = 340;

@Component({
  selector: 'app-admin-rosters',
  standalone: true,
  imports: [FormsModule, DragDropModule, RouterModule, NgTemplateOutlet],
  templateUrl: './admin-rosters.html',
  styleUrl: './admin-rosters.css',
})
export class AdminRostersComponent implements OnInit {
  readonly roles: RosterRole[] = ['tank', 'heal', 'dps'];

  showCreateModal = signal(false);
  newRoster = { name: '', description: '', weight: 1 };

  // Modal for editing
  showEditModal = signal(false);
  editingRoster: Roster | null = null;

  // Context Menu state
  contextMenuVisible = signal(false);
  contextMenuPosition = signal({ x: 0, y: 0 });
  contextMenuCharacter = signal<Character | null>(null);
  contextMenuCurrentRosterId = signal<string | null>(null);

  // Filtres du pool de personnages non assignés
  poolSearch = signal('');
  poolRole = signal<RosterRole | null>(null);

  public authService = inject(AuthService);
  public i18n = inject(I18nService);
  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');
  limitReached = computed(() => !this.isPro() && this.rosterService.rosters().length >= 2);

  filteredUnassigned = computed(() => {
    const search = this.poolSearch().trim().toLowerCase();
    const role = this.poolRole();
    return this.rosterService
      .unassignedCharacters()
      .filter(
        (c) =>
          (!search || c.name.toLowerCase().includes(search)) &&
          (!role || AdminRostersComponent.canPlay(c, role)),
      );
  });

  // Personnages de chaque roster regroupés par rôle tenu dans le roster
  rosterBuckets = computed(() => {
    const buckets = new Map<string, RoleBuckets>();
    for (const roster of this.rosterService.rosters()) {
      const bucket: RoleBuckets = { tank: [], heal: [], dps: [] };
      for (const char of roster.characters ?? []) {
        bucket[AdminRostersComponent.roleOf(char)].push(char);
      }
      buckets.set(roster.id, bucket);
    }
    return buckets;
  });

  constructor(
    public rosterService: RosterService,
    public characterService: CharacterService,
    private confirm: ConfirmService,
    private toast: ToastService,
  ) {}

  /** Rôle tenu dans le roster, ou rôle par défaut déduit des rôles déclarés (tank > heal > dps). */
  static roleOf(char: Character): RosterRole {
    return char.roster_role ?? (char.is_tank ? 'tank' : char.is_heal ? 'heal' : 'dps');
  }

  static canPlay(char: Character, role: RosterRole): boolean {
    return role === 'tank' ? !!char.is_tank : role === 'heal' ? !!char.is_heal : !!char.is_dps;
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.rosterService.loadRosters().subscribe();
    this.rosterService.loadUnassignedCharacters().subscribe();
  }

  bucket(rosterId: string, role: RosterRole): Character[] {
    return this.rosterBuckets().get(rosterId)?.[role] ?? [];
  }

  drop(event: CdkDragDrop<Character[]>, rosterId: string | null, role?: RosterRole) {
    // L'ordre n'est pas persisté (tri par nom) : un drop dans la même liste ne change rien
    if (event.previousContainer === event.container) return;
    this.assign(event.item.data as Character, rosterId, role);
  }

  private assign(char: Character, rosterId: string | null, role?: RosterRole) {
    if (!char.id) return;
    const nextRole = rosterId ? (role ?? AdminRostersComponent.roleOf(char)) : null;
    const moved: Character = { ...char, roster_id: rosterId, roster_role: nextRole };
    const byName = (a: Character, b: Character) => a.name.localeCompare(b.name);

    // Optimistic UI update
    this.rosterService.unassignedCharacters.update((list) => {
      const rest = list.filter((c) => c.id !== char.id);
      return rosterId ? rest : [...rest, moved].sort(byName);
    });
    this.rosterService.rosters.update((rosters) =>
      rosters.map((r) => {
        const rest = (r.characters ?? []).filter((c) => c.id !== char.id);
        return { ...r, characters: r.id === rosterId ? [...rest, moved].sort(byName) : rest };
      }),
    );

    this.rosterService.assignCharacter(char.id, rosterId, nextRole ?? undefined).subscribe({
      error: (err) => {
        console.error('[Rosters] Failed to assign character:', err);
        this.toast.error(this.i18n.t('admin.rosters.toast_assign_error'));
        this.loadAll(); // Rollback on error
      },
    });
  }

  onCreateRoster() {
    if (!this.newRoster.name) return;
    this.rosterService.createRoster(this.newRoster).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('admin.rosters.toast_create_success'));
        this.closeModal();
      },
      error: () => this.toast.error(this.i18n.t('admin.rosters.toast_create_error')),
    });
  }

  onUpdateRoster() {
    if (!this.editingRoster || !this.editingRoster.name) return;
    this.rosterService
      .updateRoster(this.editingRoster.id, {
        name: this.editingRoster.name,
        description: this.editingRoster.description,
        weight: this.editingRoster.weight,
      })
      .subscribe({
        next: () => {
          this.toast.success(this.i18n.t('admin.rosters.toast_update_success'));
          this.closeEditModal();
        },
        error: () => this.toast.error(this.i18n.t('admin.rosters.toast_update_error')),
      });
  }

  async onDeleteRoster(id: string) {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.rosters.confirm_delete_title'),
      this.i18n.t('admin.rosters.confirm_delete_msg'),
    );

    if (ok) {
      this.rosterService.deleteRoster(id).subscribe({
        next: () => this.toast.success(this.i18n.t('admin.rosters.toast_delete_success')),
        error: () => this.toast.error(this.i18n.t('admin.rosters.toast_delete_error')),
      });
    }
  }

  openEditModal(roster: Roster) {
    this.editingRoster = { ...roster };
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editingRoster = null;
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.newRoster = { name: '', description: '', weight: 1 };
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  roleOf(char: Character): RosterRole {
    return AdminRostersComponent.roleOf(char);
  }

  togglePoolRole(role: RosterRole) {
    this.poolRole.update((current) => (current === role ? null : role));
  }

  onContextMenu(event: MouseEvent, character: Character, currentRosterId: string | null) {
    event.preventDefault();
    event.stopPropagation?.();
    this.contextMenuCharacter.set(character);
    this.contextMenuCurrentRosterId.set(currentRosterId);
    // Garde le menu dans le viewport (clic près des bords, mobile)
    this.contextMenuPosition.set({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_MAX_HEIGHT)),
    });
    this.contextMenuVisible.set(true);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  onDocumentClick() {
    if (this.contextMenuVisible()) {
      this.contextMenuVisible.set(false);
    }
  }

  moveToRoster(targetRosterId: string | null) {
    const char = this.contextMenuCharacter();
    this.contextMenuVisible.set(false);
    if (char) this.assign(char, targetRosterId);
  }

  setRole(role: RosterRole) {
    const char = this.contextMenuCharacter();
    const rosterId = this.contextMenuCurrentRosterId();
    this.contextMenuVisible.set(false);
    if (char && rosterId && this.roleOf(char) !== role) this.assign(char, rosterId, role);
  }
}
