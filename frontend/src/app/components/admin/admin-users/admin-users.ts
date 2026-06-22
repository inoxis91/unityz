import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User, UserRole } from '../../../services/auth';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css'
})
export class AdminUsersComponent implements OnInit {
  public authService = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  public i18n = inject(I18nService);
  
  users = signal<User[]>([]);
  roles: { value: UserRole, label: string }[] = [
    { value: 'admin', label: 'Administrateur' },
    { value: 'raid_leader', label: 'Raid Leader' },
    { value: 'treasurer', label: 'Trésorier(e)' },
    { value: 'event_manager', label: 'Responsable Évent' },
    { value: 'member', label: 'Membre standard' }
  ];

  showCharactersModal = signal(false);
  modalUser = signal<any | null>(null);

  ngOnInit() {
    this.loadUsers();
  }

  openCharactersModal(user: any) {
    this.modalUser.set(user);
    this.showCharactersModal.set(true);
  }

  closeCharactersModal() {
    this.showCharactersModal.set(false);
    this.modalUser.set(null);
  }

  loadUsers() {
    this.authService.getUsers().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.toast.error(this.i18n.t('admin.users.toast_load_error'))
    });
  }

  onRoleChange(user: User, newRole: any) {
    this.authService.updateUserRole(user.id, newRole as UserRole).subscribe({
      next: () => this.toast.success(
        this.i18n.t('admin.users.toast_role_success')
          .replace('{member}', user.battletag)
      ),
      error: () => {
        this.toast.error(this.i18n.t('admin.users.toast_role_error'));
        this.loadUsers(); // Revert on UI
      }
    });
  }

  async onDeleteUser(user: User) {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.users.confirm_delete_title'),
      this.i18n.t('admin.users.confirm_delete_msg')
        .replace('{member}', user.battletag)
    );

    if (ok) {
      this.authService.deleteUser(user.id).subscribe({
        next: () => {
          this.toast.success(this.i18n.t('admin.users.toast_delete_success'));
          this.loadUsers();
        },
        error: (err) => {
          console.error('Delete error:', err);
          this.toast.error(this.i18n.t('admin.users.toast_delete_error'));
        }
      });
    }
  }
}
