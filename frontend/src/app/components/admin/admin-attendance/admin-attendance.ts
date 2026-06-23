import { Component, OnInit, signal, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth';
import { CharacterService } from '../../../services/character';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';

@Component({
  selector: 'app-admin-attendance',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-attendance.html',
  styleUrl: './admin-attendance.css',
})
export class AdminAttendanceComponent implements OnInit {
  public authService = inject(AuthService);
  private characterService = inject(CharacterService);
  private toast = inject(ToastService);
  public i18n = inject(I18nService);

  attendanceList = signal<any[]>([]);
  isLoading = signal(true);
  searchTerm = signal('');

  ngOnInit() {
    this.loadAttendance();
  }

  loadAttendance() {
    this.isLoading.set(true);
    this.authService.getGuildAttendance().subscribe({
      next: (data) => {
        this.attendanceList.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading guild attendance:', err);
        this.toast.error(this.i18n.t('admin.attendance.toast_load_error'));
        this.isLoading.set(false);
      },
    });
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  getFilteredList(): any[] {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.attendanceList();

    return this.attendanceList().filter(
      (item) =>
        item.battletag.toLowerCase().includes(term) ||
        (item.main_character_name && item.main_character_name.toLowerCase().includes(term)),
    );
  }

  getAttendanceClass(percentage: number): string {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'average';
    return 'warning';
  }
}
