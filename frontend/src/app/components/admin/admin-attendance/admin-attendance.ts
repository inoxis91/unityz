import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../services/auth';
import { CharacterService } from '../../../services/character';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';

interface MemberAttendance {
  user_id?: string;
  battletag: string;
  main_character_name?: string | null;
  main_character_class?: string | null;
  attended: number;
  total_eligible: number;
  percentage: number;
}

type SortKey = 'rate' | 'name';
type Tier = 'excellent' | 'good' | 'average' | 'warning';

/** Palier d'assiduité (couleurs cohérentes avec le tableau de bord). */
export function attendanceTier(percentage: number): Tier {
  if (percentage >= 90) return 'excellent';
  if (percentage >= 70) return 'good';
  if (percentage >= 50) return 'average';
  return 'warning';
}

@Component({
  selector: 'app-admin-attendance',
  templateUrl: './admin-attendance.html',
  styleUrl: './admin-attendance.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAttendanceComponent {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  readonly attendanceList = signal<MemberAttendance[]>([]);
  readonly isLoading = signal(true);
  readonly searchTerm = signal('');
  readonly sortKey = signal<SortKey>('rate');
  readonly tier = attendanceTier;

  /** Seuls les membres avec au moins un événement éligible entrent dans les statistiques. */
  private readonly measured = computed(() =>
    this.attendanceList().filter((m) => m.total_eligible > 0),
  );

  readonly stats = computed(() => {
    const list = this.measured();
    const average = list.length
      ? Math.round(list.reduce((sum, m) => sum + m.percentage, 0) / list.length)
      : null;
    return {
      average,
      assiduous: list.filter((m) => m.percentage >= 80).length,
      atRisk: list.filter((m) => m.percentage < 50).length,
    };
  });

  readonly filtered = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const list = this.attendanceList().filter(
      (m) =>
        !term ||
        m.battletag.toLowerCase().includes(term) ||
        (m.main_character_name ?? '').toLowerCase().includes(term),
    );
    return this.sortKey() === 'rate'
      ? [...list].sort(
          (a, b) => b.percentage - a.percentage || a.battletag.localeCompare(b.battletag),
        )
      : [...list].sort((a, b) => a.battletag.localeCompare(b.battletag));
  });

  constructor() {
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
        console.error('[AdminAttendance] Error loading guild attendance', err);
        this.toast.error(this.i18n.t('admin.attendance.toast_load_error'));
        this.isLoading.set(false);
      },
    });
  }

  classId(className: string | null | undefined): string {
    return CharacterService.getClassId(className ?? undefined);
  }

  classIcon(className: string | null | undefined): string {
    return CharacterService.getClassIcon(className ?? undefined);
  }
}
