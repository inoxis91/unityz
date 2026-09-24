import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService, User, UserRole } from '../../../services/auth';
import { CharacterService } from '../../../services/character';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';

const ROLES: UserRole[] = ['admin', 'raid_leader', 'treasurer', 'event_manager', 'member'];

@Component({
  selector: 'app-admin-users',
  imports: [DatePipe],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'modalUser.set(null)' },
})
export class AdminUsersComponent {
  readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly i18n = inject(I18nService);

  readonly roles = ROLES;
  readonly users = signal<User[]>([]);
  readonly loaded = signal(false);
  readonly query = signal('');
  readonly roleFilter = signal<UserRole | null>(null);
  readonly modalUser = signal<User | null>(null);

  readonly currentUserId = computed(() => this.authService.currentUser()?.id);

  readonly roleCounts = computed(() => {
    const counts = new Map<UserRole, number>();
    for (const u of this.users()) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    return counts;
  });

  readonly discordLinked = computed(() => this.users().filter((u) => u.discord_id).length);

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter(
      (u) =>
        (!role || u.role === role) &&
        (!q ||
          u.battletag.toLowerCase().includes(q) ||
          (u.characters ?? []).some((c: { name: string }) => c.name.toLowerCase().includes(q))),
    );
  });

  constructor() {
    this.authService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loaded.set(true);
      },
      error: () => {
        this.loaded.set(true);
        this.toast.error(this.i18n.t('admin.users.toast_load_error'));
      },
    });
  }

  mainOf(user: User): { name: string; class: string } | null {
    return user.characters?.find((c: { is_main: boolean }) => c.is_main) ?? null;
  }

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  toggleRoleFilter(role: UserRole) {
    this.roleFilter.set(this.roleFilter() === role ? null : role);
  }

  /** Changement de rôle optimiste, annulé si l'API refuse. */
  onRoleChange(user: User, role: UserRole) {
    if (role === user.role) return;
    const previous = user.role;
    this.setRole(user.id, role);
    this.authService.updateUserRole(user.id, role).subscribe({
      next: () =>
        this.toast.success(
          this.i18n.t('admin.users.toast_role_success').replace('{member}', user.battletag),
        ),
      error: () => {
        this.setRole(user.id, previous);
        this.toast.error(this.i18n.t('admin.users.toast_role_error'));
      },
    });
  }

  private setRole(id: string, role: UserRole) {
    this.users.update((list) => list.map((u) => (u.id === id ? { ...u, role } : u)));
  }

  async onDeleteUser(user: User) {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.users.confirm_delete_title'),
      this.i18n.t('admin.users.confirm_delete_msg').replace('{member}', user.battletag),
      undefined,
      undefined,
      true,
    );
    if (!ok) return;

    const previous = this.users();
    this.users.set(previous.filter((u) => u.id !== user.id));
    this.authService.deleteUser(user.id).subscribe({
      next: () => this.toast.success(this.i18n.t('admin.users.toast_delete_success')),
      error: (err) => {
        console.error('[AdminUsers] Delete error', err);
        this.users.set(previous);
        this.toast.error(this.i18n.t('admin.users.toast_delete_error'));
      },
    });
  }
}
