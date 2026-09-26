import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BackofficeService, Period } from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import { openGuild } from '../backoffice';
import { formatPercent, relativeTime } from '../backoffice-utils';

type Source = 'all' | 'payment_exit' | 'trial_end' | 'cancel';

@Component({
  selector: 'app-bo-reasons',
  templateUrl: './bo-reasons.html',
  styleUrl: './bo-reasons.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoReasonsComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly periods: Period[] = [30, 90, 365];
  protected readonly sources: Source[] = ['all', 'payment_exit', 'trial_end', 'cancel'];
  protected readonly days = signal<Period>(90);
  protected readonly source = signal<Source>('all');

  protected readonly data = rxResource({
    params: () => ({ days: this.days(), v: this.api.version() }),
    stream: ({ params }) => this.api.reasons(params.days),
  });

  /** Raisons agrégées pour la source choisie, triées par fréquence. */
  protected readonly reasons = computed(() => {
    if (!this.data.hasValue()) return [];
    const source = this.source();
    const totals = new Map<string, number>();
    for (const f of this.data.value().feedback) {
      if (source === 'all' || f.source === source)
        totals.set(f.reason, (totals.get(f.reason) ?? 0) + f.count);
    }
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    return [...totals.entries()]
      .map(([reason, count]) => ({ reason, count, share: sum ? count / sum : 0 }))
      .sort((a, b) => b.count - a.count);
  });
  protected readonly sourceCount = computed(() => {
    const counts: Partial<Record<string, number>> = { all: 0 };
    if (!this.data.hasValue()) return counts;
    for (const f of this.data.value().feedback) {
      counts[f.source] = (counts[f.source] ?? 0) + f.count;
      counts['all'] = (counts['all'] ?? 0) + f.count;
    }
    return counts;
  });
  protected readonly comments = computed(() => {
    if (!this.data.hasValue()) return [];
    const source = this.source();
    return this.data.value().comments.filter((c) => source === 'all' || c.source === source);
  });

  protected pct(value: number | null) {
    return formatPercent(value, this.i18n.currentLocale());
  }

  protected when(iso: string) {
    return relativeTime(iso, this.i18n.currentLocale());
  }

  protected open(id: string | null) {
    if (id) openGuild(this.router, this.route, id);
  }
}
