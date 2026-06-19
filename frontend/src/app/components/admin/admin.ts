import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRostersComponent } from './admin-rosters/admin-rosters';
import { AdminFeesComponent } from './admin-fees/admin-fees';
import { AdminUsersComponent } from './admin-users/admin-users';
import { AdminSettingsComponent } from './admin-settings/admin-settings';
import { AdminAttendanceComponent } from './admin-attendance/admin-attendance';
import { AdminAbsencesComponent } from './admin-absences/admin-absences';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    AdminRostersComponent, 
    AdminFeesComponent, 
    AdminUsersComponent, 
    AdminSettingsComponent,
    AdminAttendanceComponent,
    AdminAbsencesComponent
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit {
  public authService = inject(AuthService);
  public i18n = inject(I18nService);
  activeTab = signal<'users' | 'rosters' | 'fees' | 'attendance' | 'absences' | 'settings'>('users');

  constructor() {}

  ngOnInit() {
    // Set default tab based on permissions
    if (this.authService.isAdmin()) {
      this.activeTab.set('users');
    } else if (this.authService.canManageRosters()) {
      this.activeTab.set('rosters');
    } else if (this.authService.canManageEvents()) {
      this.activeTab.set('attendance');
    } else if (this.authService.canManageFees()) {
      this.activeTab.set('fees');
    }
  }
}
