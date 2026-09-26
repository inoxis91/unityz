import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../services/auth';
import { BackofficeService } from '../../services/backoffice';
import { I18nService } from '../../services/i18n';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import { BoAuditComponent } from './bo-audit/bo-audit';
import { BoFunnelComponent } from './bo-funnel/bo-funnel';
import { BoGuildDrawerComponent } from './bo-guild-drawer/bo-guild-drawer';
import { BoGuildsComponent } from './bo-guilds/bo-guilds';
import { BoHealthComponent } from './bo-health/bo-health';
import { BoOverviewComponent } from './bo-overview/bo-overview';
import { BoReasonsComponent } from './bo-reasons/bo-reasons';
import { BoUsageComponent } from './bo-usage/bo-usage';

export const BO_TABS = [
  'overview',
  'funnel',
  'guilds',
  'usage',
  'reasons',
  'audit',
  'health',
] as const;
export type BoTab = (typeof BO_TABS)[number];

const TAB_ICONS: Record<BoTab, string> = {
  overview: '📊',
  funnel: '🧭',
  guilds: '🏰',
  usage: '📈',
  reasons: '💬',
  audit: '🗂️',
  health: '🩺',
};

/**
 * Back-office du créateur du site. L'onglet, les filtres et la fiche ouverte vivent dans l'URL
 * (?tab=…&guild=…) : liens partageables et bouton retour du navigateur.
 */
@Component({
  selector: 'app-backoffice',
  imports: [
    PageHeaderComponent,
    BoOverviewComponent,
    BoFunnelComponent,
    BoGuildsComponent,
    BoUsageComponent,
    BoReasonsComponent,
    BoAuditComponent,
    BoHealthComponent,
    BoGuildDrawerComponent,
  ],
  templateUrl: './backoffice.html',
  styleUrl: './backoffice.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackofficeComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly api = inject(BackofficeService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly tabs = BO_TABS.map((id) => ({ id, icon: TAB_ICONS[id] }));
  protected readonly activeTab = computed<BoTab>(() => {
    const tab = this.params().get('tab') as BoTab | null;
    return tab && BO_TABS.includes(tab) ? tab : 'overview';
  });
  protected readonly openGuildId = computed(() => this.params().get('guild'));

  select(tab: BoTab) {
    // Les filtres d'un onglet ne suivent pas dans un autre ; la fiche ouverte non plus
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab } });
  }

  closeGuild() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { guild: null },
      queryParamsHandling: 'merge',
    });
  }

  reauthenticate() {
    this.api.reauthRequired.set(false);
    this.auth.login('/backoffice');
  }
}

/** Ouvre la fiche d'une guilde par-dessus l'onglet courant. */
export function openGuild(router: Router, route: ActivatedRoute, guildId: string) {
  router.navigate([], {
    relativeTo: route,
    queryParams: { guild: guildId },
    queryParamsHandling: 'merge',
  });
}
