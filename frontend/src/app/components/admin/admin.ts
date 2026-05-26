import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRostersComponent } from './admin-rosters/admin-rosters';
import { AdminFeesComponent } from './admin-fees/admin-fees';
import { AdminUsersComponent } from './admin-users/admin-users';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminRostersComponent, AdminFeesComponent, AdminUsersComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit {
  public authService = inject(AuthService);
  activeTab = signal<'users' | 'rosters' | 'fees'>('users');

  constructor() {}

  ngOnInit() {
    // Set default tab based on permissions
    if (this.authService.isAdmin()) {
      this.activeTab.set('users');
    } else if (this.authService.canManageRosters()) {
      this.activeTab.set('rosters');
    } else if (this.authService.canManageFees()) {
      this.activeTab.set('fees');
    }
  }
}
