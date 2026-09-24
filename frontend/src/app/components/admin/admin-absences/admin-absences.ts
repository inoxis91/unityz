import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../services/auth';
import { CharacterService } from '../../../services/character';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { toLocalDateStr } from '../../calendar/calendar-utils';
import {
  Absence,
  AbsenceState,
  absenceDays,
  absenceState,
  sortAbsences,
} from '../../absences/absences-utils';

interface GuildAbsence extends Absence {
  battletag: string;
  main_character_name?: string | null;
  main_character_class?: string | null;
}

@Component({
  selector: 'app-admin-absences',
  imports: [DatePipe],
  templateUrl: './admin-absences.html',
  styleUrl: './admin-absences.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAbsencesComponent {
  readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  readonly states: AbsenceState[] = ['current', 'upcoming', 'past'];
  private readonly today = toLocalDateStr(new Date());

  readonly absencesList = signal<GuildAbsence[]>([]);
  readonly isLoading = signal(true);
  readonly searchTerm = signal('');
  readonly stateFilter = signal<AbsenceState | null>(null);

  private readonly decorated = computed(() =>
    sortAbsences(this.absencesList(), this.today).map((a) => ({
      ...a,
      state: absenceState(a, this.today),
      days: absenceDays(a),
    })),
  );

  readonly counts = computed(() => {
    const counts: Record<AbsenceState, number> = { current: 0, upcoming: 0, past: 0 };
    for (const a of this.decorated()) counts[a.state]++;
    return counts;
  });

  readonly filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const state = this.stateFilter();
    return this.decorated().filter(
      (a) =>
        (!state || a.state === state) &&
        (!term ||
          a.battletag.toLowerCase().includes(term) ||
          (a.main_character_name ?? '').toLowerCase().includes(term) ||
          (a.reason ?? '').toLowerCase().includes(term)),
    );
  });

  constructor() {
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
        console.error('[AdminAbsences] Error loading guild absences', err);
        this.toast.error(this.i18n.t('absences.toast.error_load'));
        this.isLoading.set(false);
      },
    });
  }

  toggleState(state: AbsenceState) {
    this.stateFilter.set(this.stateFilter() === state ? null : state);
  }

  classId(className: string | null | undefined): string {
    return CharacterService.getClassId(className ?? undefined);
  }

  classIcon(className: string | null | undefined): string {
    return CharacterService.getClassIcon(className ?? undefined);
  }

  async onDelete(absence: GuildAbsence) {
    const confirmed = await this.confirmService.ask(
      this.i18n.t('absences.confirm_delete_title'),
      this.i18n.t('absences.confirm_delete_message'),
      this.i18n.t('absences.list.btn_delete'),
      this.i18n.t('calendar.form.btn_cancel'),
      true,
    );
    if (!confirmed) return;

    const previous = this.absencesList();
    this.absencesList.set(previous.filter((a) => a.id !== absence.id));
    this.authService.deleteGuildAbsenceAdmin(absence.id).subscribe({
      next: () => this.toast.success(this.i18n.t('absences.toast.delete_success')),
      error: (err) => {
        console.error('[AdminAbsences] Error deleting absence', err);
        this.absencesList.set(previous);
        this.toast.error(this.i18n.t('absences.toast.error_delete'));
      },
    });
  }
}
