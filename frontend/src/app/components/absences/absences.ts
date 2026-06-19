import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';

@Component({
  selector: 'app-absences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './absences.html',
  styleUrl: './absences.css'
})
export class AbsencesComponent implements OnInit {
  absences = signal<any[]>([]);
  isLoading = signal(false);
  isSubmitting = signal(false);

  startDate = signal<string>('');
  endDate = signal<string>('');
  reason = signal<string>('');

  public i18n = inject(I18nService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private confirmService = inject(ConfirmService);

  ngOnInit() {
    this.loadAbsences();
  }

  loadAbsences() {
    this.isLoading.set(true);
    this.authService.getUserAbsences().subscribe({
      next: (data) => {
        this.absences.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading user absences:', err);
        this.toast.error(this.i18n.t('absences.toast.error_load'));
        this.isLoading.set(false);
      }
    });
  }

  onSubmit() {
    const start = this.startDate();
    const end = this.endDate();
    const note = this.reason().trim();

    if (!start || !end) {
      this.toast.error(this.i18n.t('absences.validation.required'));
      return;
    }

    if (new Date(start) > new Date(end)) {
      this.toast.error(this.i18n.t('absences.validation.dates'));
      return;
    }

    this.isSubmitting.set(true);
    this.authService.declareAbsence(start, end, note || null).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('absences.toast.success'));
        this.startDate.set('');
        this.endDate.set('');
        this.reason.set('');
        this.isSubmitting.set(false);
        this.loadAbsences();
      },
      error: (err) => {
        console.error('Error declaring absence:', err);
        this.toast.error(this.i18n.t('absences.toast.error_declare'));
        this.isSubmitting.set(false);
      }
    });
  }

  onDelete(id: string) {
    this.confirmService.ask(
      this.i18n.t('absences.confirm_delete_title'),
      this.i18n.t('absences.confirm_delete_message'),
      this.i18n.t('absences.list.btn_delete'),
      'Annuler'
    ).then((confirmed) => {
      if (!confirmed) return;

      this.authService.deleteUserAbsence(id).subscribe({
        next: () => {
          this.toast.success(this.i18n.t('absences.toast.delete_success'));
          this.loadAbsences();
        },
        error: (err) => {
          console.error('Error deleting absence:', err);
          this.toast.error(this.i18n.t('absences.toast.error_delete'));
        }
      });
    });
  }
}
