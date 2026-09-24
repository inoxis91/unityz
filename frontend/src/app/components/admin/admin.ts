import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminRostersComponent } from './admin-rosters/admin-rosters';
import { AdminCharactersComponent } from './admin-characters/admin-characters';
import { AdminFeesComponent } from './admin-fees/admin-fees';
import { AdminUsersComponent } from './admin-users/admin-users';
import { AdminSettingsComponent } from './admin-settings/admin-settings';
import { AdminAttendanceComponent } from './admin-attendance/admin-attendance';
import { AdminAbsencesComponent } from './admin-absences/admin-absences';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';

type AdminTab =
  | 'users'
  | 'rosters'
  | 'characters'
  | 'attendance'
  | 'absences'
  | 'fees'
  | 'settings';

interface TabDef {
  id: AdminTab;
  icon: string;
  label: string;
  allowed: () => boolean;
}

@Component({
  selector: 'app-admin',
  imports: [
    PageHeaderComponent,
    AdminRostersComponent,
    AdminCharactersComponent,
    AdminFeesComponent,
    AdminUsersComponent,
    AdminSettingsComponent,
    AdminAttendanceComponent,
    AdminAbsencesComponent,
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent {
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly allTabs: TabDef[] = [
    {
      id: 'users',
      icon: '👥',
      label: 'admin.tab.members',
      allowed: () => this.authService.isAdmin(),
    },
    {
      id: 'rosters',
      icon: '🛡️',
      label: 'admin.tab.rosters',
      allowed: () => this.authService.canManageRosters(),
    },
    {
      id: 'characters',
      icon: '🧙',
      label: 'admin.tab.characters',
      allowed: () => this.authService.canManageRosters(),
    },
    {
      id: 'attendance',
      icon: '📈',
      label: 'admin.tab.attendance',
      allowed: () => this.authService.canManageEvents(),
    },
    {
      id: 'absences',
      icon: '🌴',
      label: 'admin.tab.absences',
      allowed: () => this.authService.canManageEvents(),
    },
    {
      id: 'fees',
      icon: '💰',
      label: 'admin.tab.fees',
      allowed: () => this.authService.canManageFees(),
    },
    {
      id: 'settings',
      icon: '⚙️',
      label: 'admin.tab.settings',
      allowed: () => this.authService.isAdmin(),
    },
  ];

  /** Onglets autorisés pour le rôle courant (miroir des middlewares du backend). */
  readonly tabs = computed(() => this.allTabs.filter((t) => t.allowed()));

  private readonly requestedTab = signal<AdminTab | null>(null);

  /** Onglet demandé dans l'URL s'il est autorisé, sinon le premier accessible. */
  readonly activeTab = computed<AdminTab | null>(() => {
    const tabs = this.tabs();
    const requested = this.requestedTab();
    return tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? null;
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.requestedTab.set(params.get('tab') as AdminTab | null);
    });
  }

  select(tab: AdminTab) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });
  }
}
