import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../../services/auth';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';

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
  
  users = signal<User[]>([]);

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.authService.getUsers().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.toast.error('Erreur lors du chargement des utilisateurs.')
    });
  }

  async onDeleteUser(user: User) {
    const ok = await this.confirm.ask(
      'Supprimer le membre',
      `Voulez-vous vraiment supprimer ${user.battletag} ? Cette action supprimera également tous ses personnages et inscriptions.`
    );

    if (ok) {
      this.authService.deleteUser(user.id).subscribe({
        next: () => {
          this.toast.success('Membre supprimé avec succès.');
          this.loadUsers();
        },
        error: (err) => {
          console.error('Delete error:', err);
          this.toast.error('Erreur lors de la suppression.');
        }
      });
    }
  }
}
