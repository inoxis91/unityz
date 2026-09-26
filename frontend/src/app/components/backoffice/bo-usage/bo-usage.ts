import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BackofficeService } from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import { BoChartComponent } from '../bo-chart/bo-chart';
import { openGuild } from '../backoffice';
import {
  bucketSeries,
  formatDay,
  formatNumber,
  formatPercent,
  heatLevel,
} from '../backoffice-utils';

@Component({
  selector: 'app-bo-usage',
  imports: [BoChartComponent],
  templateUrl: './bo-usage.html',
  styleUrl: './bo-usage.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoUsageComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly data = rxResource({
    params: () => this.api.version(),
    stream: () => this.api.usage(),
  });

  protected readonly activePoints = computed(() =>
    this.data.hasValue() ? bucketSeries(this.data.value().series, 'active_users') : [],
  );
  protected readonly features = computed(() =>
    this.data.hasValue()
      ? [...this.data.value().adoption.features].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
      : [],
  );
  protected readonly weeks = Array.from({ length: 8 }, (_, i) => i);
  protected readonly count = (v: number) => formatNumber(Math.round(v), this.i18n.currentLocale());

  protected pct(value: number | null) {
    return formatPercent(value, this.i18n.currentLocale());
  }

  protected heat(value: number | null) {
    return heatLevel(value);
  }

  protected week(day: string) {
    return formatDay(day, this.i18n.currentLocale());
  }

  protected open(id: string) {
    openGuild(this.router, this.route, id);
  }
}
