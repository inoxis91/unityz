import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import { toLocalDateStr } from '../calendar/calendar-utils';
import { Absence, absenceDays, absenceState, sortAbsences } from './absences-utils';

@Component({
  selector: 'app-absences',
  imports: [DatePipe, FormsModule, PageHeaderComponent],
  templateUrl: './absences.html',
  styleUrl: './absences.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbsencesComponent {
  readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  readonly today = toLocalDateStr(new Date());

  readonly absences = signal<Absence[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);

  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly isIndefinite = signal(false);
  readonly reason = signal('');

  readonly sorted = computed(() =>
    sortAbsences(this.absences(), this.today).map((abs) => ({
      ...abs,
      state: absenceState(abs, this.today),
      days: absenceDays(abs),
    })),
  );

  readonly stats = computed(() => {
    const list = this.sorted();
    return {
      current: list.filter((a) => a.state === 'current').length,
      upcoming: list.filter((a) => a.state === 'upcoming').length,
      total: list.length,
    };
  });

  readonly formDays = computed(() =>
    this.startDate() && !this.isIndefinite() && this.endDate()
      ? absenceDays({ start_date: this.startDate(), end_date: this.endDate() })
      : null,
  );

  readonly datesInvalid = computed(
    () => !this.isIndefinite() && !!this.endDate() && this.endDate() < this.startDate(),
  );

  constructor() {
    this.loadAbsences();
  }

  private loadAbsences() {
    this.authService.getUserAbsences().subscribe({
      next: (data) => {
        this.absences.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('[Absences] Error loading user absences', err);
        this.toast.error(this.i18n.t('absences.toast.error_load'));
        this.isLoading.set(false);
      },
    });
  }

  onSubmit() {
    const start = this.startDate();
    const indefinite = this.isIndefinite();
    const end = indefinite ? null : this.endDate();

    if (!start) {
      this.toast.error(this.i18n.t('absences.validation.start_required'));
      return;
    }
    if (!indefinite && !end) {
      this.toast.error(this.i18n.t('absences.validation.required'));
      return;
    }
    if (this.datesInvalid()) {
      this.toast.error(this.i18n.t('absences.validation.dates'));
      return;
    }

    this.isSubmitting.set(true);
    this.authService.declareAbsence(start, end, this.reason().trim() || null).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('absences.toast.success'));
        this.startDate.set('');
        this.endDate.set('');
        this.isIndefinite.set(false);
        this.reason.set('');
        this.isSubmitting.set(false);
        this.loadAbsences();
      },
      error: (err) => {
        console.error('[Absences] Error declaring absence', err);
        this.toast.error(this.i18n.t('absences.toast.error_declare'));
        this.isSubmitting.set(false);
      },
    });
  }

  async onDelete(abs: Absence) {
    const confirmed = await this.confirmService.ask(
      this.i18n.t('absences.confirm_delete_title'),
      this.i18n.t('absences.confirm_delete_message'),
      this.i18n.t('absences.list.btn_delete'),
      this.i18n.t('calendar.form.btn_cancel'),
      true,
    );
    if (!confirmed) return;

    // Retrait optimiste, restauré si l'API refuse
    const previous = this.absences();
    this.absences.set(previous.filter((a) => a.id !== abs.id));
    this.authService.deleteUserAbsence(abs.id).subscribe({
      next: () => this.toast.success(this.i18n.t('absences.toast.delete_success')),
      error: (err) => {
        console.error('[Absences] Error deleting absence', err);
        this.absences.set(previous);
        this.toast.error(this.i18n.t('absences.toast.error_delete'));
      },
    });
  }
}
