import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BackofficeService, GuildState, Overview, Period } from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import { CountUpDirective } from '../../../shared/wcl/count-up';
import { BoChartComponent } from '../bo-chart/bo-chart';
import { openGuild } from '../backoffice';
import {
  GUILD_STATES,
  STATE_TONE,
  bucketSeries,
  delta,
  formatCents,
  formatDay,
  formatNumber,
  formatPercent,
  relativeTime,
} from '../backoffice-utils';

type Metric = 'new_guilds' | 'new_users' | 'offers_activated' | 'revenue_cents' | 'active_users';

const RECENT_ICONS: Record<string, string> = {
  checkout_completed: '💳',
  free_trial_activated: '🎁',
  subscription_ended: '👋',
  payment_failed: '⚠️',
  subscription_cancel_requested: '❌',
  plan_changed: '🔁',
  feedback_submitted: '💬',
  guild_selected: '🏰',
};

@Component({
  selector: 'app-bo-overview',
  imports: [BoChartComponent, CountUpDirective],
  templateUrl: './bo-overview.html',
  styleUrl: './bo-overview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoOverviewComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly periods: Period[] = [7, 30, 90, 365];
  protected readonly metrics: Metric[] = [
    'new_guilds',
    'new_users',
    'offers_activated',
    'revenue_cents',
    'active_users',
  ];
  protected readonly days = signal<Period>(30);
  protected readonly metric = signal<Metric>('new_guilds');

  protected readonly data = rxResource({
    params: () => ({ days: this.days(), v: this.api.version() }),
    stream: ({ params }) => this.api.overview(params.days),
  });
  protected readonly overview = computed<Overview | undefined>(() =>
    this.data.hasValue() ? this.data.value() : undefined,
  );

  protected readonly locale = computed(() => this.i18n.currentLocale());
  protected readonly euro = (cents: number) => formatCents(cents, this.locale());

  protected readonly kpis = computed(() => {
    const o = this.overview();
    if (!o) return [];
    const p = o.period;
    const locale = this.locale();
    return [
      {
        key: 'mrr',
        tone: 'success',
        text: this.euro(o.mrr_cents),
        hint: this.i18n.tf('bo.kpi.mrr_hint', { n: o.guilds.paying }),
      },
      {
        key: 'revenue',
        tone: 'brand',
        text: this.euro(p.revenue_cents),
        delta: this.deltaText(p.revenue_cents, p.revenue_prev_cents),
        hint: this.i18n.tf('bo.kpi.revenue_hint', { total: this.euro(o.revenue_total_cents) }),
      },
      {
        key: 'new_guilds',
        tone: 'purple',
        count: p.new_guilds,
        delta: this.deltaText(p.new_guilds, p.new_guilds_prev),
      },
      {
        key: 'new_users',
        tone: '',
        count: p.new_users,
        delta: this.deltaText(p.new_users, p.new_users_prev),
      },
      {
        key: 'trial_conversion',
        tone: 'warning',
        text: formatPercent(o.trial_conversion, locale),
        hint: this.i18n.t('bo.kpi.trial_conversion_hint'),
      },
      {
        key: 'subscriptions',
        tone: 'success',
        count: p.new_subscriptions,
        hint: this.i18n.tf('bo.kpi.subscriptions_hint', { n: p.churned }),
      },
      {
        key: 'wau',
        tone: 'brand',
        count: o.activity.wau,
        hint: this.i18n.tf('bo.kpi.wau_hint', { dau: o.activity.dau, mau: o.activity.mau }),
      },
      {
        key: 'active_guilds',
        tone: '',
        count: o.activity.active_guilds_7d,
        hint: this.i18n.tf('bo.kpi.active_guilds_hint', { n: o.guilds.total }),
      },
    ] as {
      key: string;
      tone: string;
      text?: string;
      count?: number;
      hint?: string;
      delta?: { text: string; dir: string };
    }[];
  });

  protected readonly states = computed(() => {
    const o = this.overview();
    if (!o) return [];
    const total = Math.max(1, o.guilds.total);
    return GUILD_STATES.map((state) => ({
      state,
      tone: STATE_TONE[state],
      count: o.guilds.byState[state] ?? 0,
      share: (o.guilds.byState[state] ?? 0) / total,
    }));
  });

  protected readonly chartPoints = computed(() => {
    const o = this.overview();
    return o ? bucketSeries(o.series, this.metric()) : [];
  });
  protected readonly chartFormat = computed(() =>
    this.metric() === 'revenue_cents'
      ? (v: number) => formatCents(v, this.locale())
      : (v: number) => formatNumber(Math.round(v), this.locale()),
  );

  protected readonly trackingNote = computed(() => {
    const since = this.overview()?.tracking_since;
    return since
      ? this.i18n.tf('bo.tracking_since', {
          date: formatDay(since, this.locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
        })
      : this.i18n.t('bo.tracking_none');
  });

  protected recentIcon(type: string) {
    return RECENT_ICONS[type] ?? '•';
  }

  protected recentDetail(item: Overview['recent'][number]): string {
    const d = item.data as Record<string, string>;
    if (item.type === 'plan_changed') return `${this.tier(d['from'])} → ${this.tier(d['to'])}`;
    if (item.type === 'checkout_completed') return this.tier(d['tier']);
    if (item.type === 'feedback_submitted' || item.type === 'subscription_cancel_requested') {
      return this.i18n.t('feedback.reason.' + d['reason']);
    }
    return '';
  }

  protected when(iso: string) {
    return relativeTime(iso, this.locale());
  }

  protected showState(state: GuildState) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: 'guilds', state } });
  }

  protected open(guildId: string) {
    openGuild(this.router, this.route, guildId);
  }

  private tier(tier: string | undefined) {
    return this.i18n.t('bo.tier.' + (tier ?? 'none'));
  }

  private deltaText(current: number, previous: number) {
    const d = delta(current, previous);
    const text =
      d.ratio === null
        ? current > 0
          ? this.i18n.t('bo.kpi.vs_prev_new')
          : ''
        : this.i18n.tf('bo.kpi.vs_prev', {
            value: `${d.ratio > 0 ? '+' : ''}${formatPercent(d.ratio, this.locale())}`,
          });
    return text ? { text, dir: d.direction } : undefined;
  }
}
