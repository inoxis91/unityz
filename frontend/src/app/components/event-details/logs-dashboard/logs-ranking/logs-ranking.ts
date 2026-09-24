import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18nService } from '../../../../services/i18n';
import {
  MVP_CRITERIA,
  MvpCriterion,
  RaidLogRole,
  RaidLogsAnalysis,
  ReportPlayer,
} from '../../../../services/raid-logs';
import { displayPercent, formatCompact, parseColorClass } from '../../../../shared/wcl/parse-tier';
import { PlayerTagComponent } from '../player-tag/player-tag';
import { ROLES, contributions } from '../raid-logs-insights';
import { ScoreBarComponent } from '../score-bar/score-bar';

/** Classement MVP complet, avec la méthode de calcul et le détail des points par critère. */
@Component({
  selector: 'app-logs-ranking',
  imports: [DecimalPipe, PlayerTagComponent, ScoreBarComponent],
  templateUrl: './logs-ranking.html',
  styleUrl: './logs-ranking.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsRankingComponent {
  readonly i18n = inject(I18nService);

  readonly analysis = input.required<RaidLogsAnalysis>();
  readonly mine = input<Set<number>>(new Set());

  readonly filters = ['all', ...ROLES] as const;
  readonly criteria = MVP_CRITERIA;
  readonly parseColorClass = parseColorClass;
  readonly displayPercent = displayPercent;

  readonly roleFilter = signal<RaidLogRole | 'all'>('all');
  readonly expanded = signal<number | null>(null);

  readonly weights = computed(() => this.analysis().scoring.weights);
  readonly rows = computed(() => {
    const filter = this.roleFilter();
    return this.analysis()
      .players.filter((p) => filter === 'all' || p.role === filter)
      .map((player) => ({ player, parts: contributions(player.breakdown, this.weights()) }));
  });
  readonly roleCounts = computed(() => {
    const counts: Record<RaidLogRole | 'all', number> = { all: 0, tank: 0, healer: 0, dps: 0 };
    for (const p of this.analysis().players) {
      counts.all++;
      counts[p.role]++;
    }
    return counts;
  });

  toggle(actorId: number) {
    this.expanded.update((current) => (current === actorId ? null : actorId));
  }

  medal(rank: number, eligible: boolean): string | null {
    if (!eligible) return null;
    return ['🥇', '🥈', '🥉'][rank - 1] ?? null;
  }

  /** Données brutes justifiant la note d'un critère. */
  evidence(p: ReportPlayer, criterion: MvpCriterion): string {
    const t = (key: string) => this.i18n.t(key);
    const locale = this.i18n.currentLocale();
    switch (criterion) {
      case 'performance':
        return p.avgParse === null
          ? t('logs.evidence.no_parse')
          : `${t('logs.stat.avg_parse')} ${displayPercent(p.avgParse)} · ${t('logs.stat.best_parse')} ${displayPercent(p.bestParse)} · ${p.kills} ${t('logs.kills')}`;
      case 'output':
        return p.role === 'healer'
          ? `${formatCompact(p.hps, locale)} ${t('logs.unit.hps')} · ${t('logs.evidence.vs_healers')}`
          : `${formatCompact(p.dps, locale)} ${t('logs.unit.dps')} · ${t(p.role === 'tank' ? 'logs.evidence.vs_tanks' : 'logs.evidence.vs_dps')}`;
      case 'survival':
        return `${p.prematureDeaths} ${t('logs.unit.premature_deaths')} (${p.deathsWithoutHealthstone} ${t('logs.evidence.without_healthstone')}) · ${p.deaths} ${t('logs.kpi.deaths_total')} · ${p.pulls} ${t('logs.pulls')}`;
      case 'preparation':
        return `${t('logs.stat.potions')} ${p.potionPulls}/${p.potionEligiblePulls} · ${t('logs.stat.flask')} ${p.flaskPulls}/${p.pulls} · ${t('logs.stat.food')} ${p.foodPulls}/${p.pulls}`;
      case 'utility':
        return `${p.interrupts} ${t('logs.unit.interrupts')} · ${p.dispels} ${t('logs.unit.dispels')}`;
    }
  }
}
