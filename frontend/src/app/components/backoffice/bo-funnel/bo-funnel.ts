import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BackofficeService, Period } from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import { FUNNEL_STAGES, biggestDropOff, formatPercent, funnelRows } from '../backoffice-utils';

@Component({
  selector: 'app-bo-funnel',
  templateUrl: './bo-funnel.html',
  styleUrl: './bo-funnel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoFunnelComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly periods: (Period | 'all')[] = [30, 90, 365, 'all'];
  protected readonly days = signal<Period | 'all'>(90);
  protected readonly region = signal('');

  protected readonly data = rxResource({
    params: () => ({ days: this.days(), region: this.region(), v: this.api.version() }),
    stream: ({ params }) => this.api.funnel(params.days, params.region),
  });

  protected readonly guildRows = computed(() =>
    this.data.hasValue() ? funnelRows(this.data.value().guilds) : [],
  );
  protected readonly userRows = computed(() =>
    this.data.hasValue() ? funnelRows(this.data.value().users) : [],
  );
  protected readonly worst = computed(() => biggestDropOff(this.guildRows()));
  protected readonly logins = computed(() =>
    this.data.hasValue() ? this.data.value().logins : null,
  );
  protected readonly loginRate = computed(() => {
    const l = this.logins();
    return l && l.started ? formatPercent(l.succeeded / l.started, this.i18n.currentLocale()) : '—';
  });

  protected pct(value: number | null) {
    return formatPercent(value, this.i18n.currentLocale());
  }

  protected setRegion(event: Event) {
    this.region.set((event.target as HTMLSelectElement).value);
  }

  /** Liste des guildes arrêtées à cette étape (onglet Guildes filtré). */
  protected showStopped(key: string) {
    const stage = FUNNEL_STAGES.indexOf(key as (typeof FUNNEL_STAGES)[number]);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'guilds', stage, ...(this.region() ? { region: this.region() } : {}) },
    });
  }
}
