import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User, UserRole } from '../../../services/auth';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css'
})
export class AdminUsersComponent implements OnInit {
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  
  users = signal<User[]>([]);
  roles: { value: UserRole, label: string }[] = [
    { value: 'admin', label: 'Administrateur' },
    { value: 'raid_leader', label: 'Raid Leader' },
    { value: 'treasurer', label: 'Trésorier(e)' },
    { value: 'event_manager', label: 'Responsable Évent' },
    { value: 'member', label: 'Membre standard' }
  ];

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.authService.getUsers().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.toast.error('Erreur lors du chargement des utilisateurs.')
    });
  }

  onRoleChange(user: User, newRole: any) {
    this.authService.updateUserRole(user.id, newRole as UserRole).subscribe({
      next: () => this.toast.success(`Rôle de ${user.battletag} mis à jour.`),
      error: () => {
        this.toast.error('Erreur lors de la mise à jour du rôle.');
        this.loadUsers(); // Revert on UI
      }
    });
  }
}
