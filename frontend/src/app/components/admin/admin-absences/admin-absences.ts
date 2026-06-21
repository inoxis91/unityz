import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth';
import { CharacterService } from '../../../services/character';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';

@Component({
  selector: 'app-admin-absences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-absences.html',
  styleUrl: './admin-absences.css'
})
export class AdminAbsencesComponent implements OnInit {
  absencesList = signal<any[]>([]);
  isLoading = signal(false);
  searchTerm = signal<string>('');

  public i18n = inject(I18nService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private confirmService = inject(ConfirmService);

  ngOnInit() {
    this.loadAbsences();
  }

  loadAbsences() {
    this.isLoading.set(true);
    this.authService.getGuildAbsences().subscribe({
      next: (data) => {
        this.absencesList.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading guild absences:', err);
        this.toast.error(this.i18n.t('absences.toast.error_load'));
        this.isLoading.set(false);
      }
    });
  }

  getFilteredList = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    let list = this.absencesList();

    if (term) {
      list = list.filter(item => {
        const btag = item.battletag ? item.battletag.toLowerCase() : '';
        const charName = item.main_character_name ? item.main_character_name.toLowerCase() : '';
        const reason = item.reason ? item.reason.toLowerCase() : '';
        return btag.includes(term) || charName.includes(term) || reason.includes(term);
      });
    }

    // Sort by start_date descending (newest first)
    return [...list].sort((a, b) => b.start_date.localeCompare(a.start_date));
  });

  isAbsenceActive(startDate: string, endDate: string | null | undefined): boolean {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    if (!endDate) {
      return todayStr >= startDate;
    }
    return todayStr >= startDate && todayStr <= endDate;
  }

  onDelete(id: string) {
    this.confirmService.ask(
      this.i18n.t('absences.confirm_delete_title'),
      this.i18n.t('absences.confirm_delete_message'),
      this.i18n.t('absences.list.btn_delete'),
      'Annuler'
    ).then((confirmed) => {
      if (!confirmed) return;

      this.authService.deleteGuildAbsenceAdmin(id).subscribe({
        next: () => {
          this.toast.success(this.i18n.t('absences.toast.delete_success'));
          this.loadAbsences();
        },
        error: (err) => {
          console.error('Error deleting guild absence by admin:', err);
          this.toast.error(this.i18n.t('absences.toast.error_delete'));
        }
      });
    });
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
