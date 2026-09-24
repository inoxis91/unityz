import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18nService } from '../../../../services/i18n';
import { RaidLogsAnalysis, ReportPlayer } from '../../../../services/raid-logs';
import { CountUpDirective } from '../../../../shared/wcl/count-up';
import {
  displayPercent,
  formatCompact,
  formatDuration,
  parseColorClass,
} from '../../../../shared/wcl/parse-tier';
import { PerfRingComponent } from '../../../../shared/wcl/perf-ring/perf-ring';
import { PlayerTagComponent } from '../player-tag/player-tag';
import {
  ROLES,
  ROLE_ICONS,
  computeAwards,
  contributions,
  potionStatus,
  roleChampions,
} from '../raid-logs-insights';
import { ScoreBarComponent } from '../score-bar/score-bar';

const SCORE_RADIUS = 54;
const SCORE_CIRCUMFERENCE = 2 * Math.PI * SCORE_RADIUS;

/** Synthèse du raid : chiffres clés, MVP, champions par rôle, distinctions, consommables, boss. */
@Component({
  selector: 'app-logs-overview',
  imports: [
    CountUpDirective,
    DecimalPipe,
    PerfRingComponent,
    PlayerTagComponent,
    ScoreBarComponent,
  ],
  templateUrl: './logs-overview.html',
  styleUrl: './logs-overview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsOverviewComponent {
  readonly i18n = inject(I18nService);

  readonly analysis = input.required<RaidLogsAnalysis>();
  readonly mine = input<Set<number>>(new Set());
  readonly openPull = output<number>();
  readonly openRanking = output<void>();

  readonly roles = ROLES;
  readonly potionStatuses = ['full', 'partial', 'none'] as const;
  readonly roleIcons = ROLE_ICONS;
  readonly scoreRadius = SCORE_RADIUS;
  readonly scoreCircumference = SCORE_CIRCUMFERENCE;
  readonly formatDuration = formatDuration;
  readonly parseColorClass = parseColorClass;
  readonly displayPercent = displayPercent;

  readonly players = computed(() => this.analysis().players);
  readonly mvp = computed(
    () => this.players().find((p) => p.actorId === this.analysis().mvpActorId) ?? null,
  );
  readonly podium = computed(() =>
    this.players()
      .filter((p) => p.eligible && p.actorId !== this.mvp()?.actorId)
      .slice(0, 2),
  );
  readonly mvpContributions = computed(() => {
    const mvp = this.mvp();
    return mvp ? contributions(mvp.breakdown, this.analysis().scoring.weights) : [];
  });
  readonly mvpDashOffset = computed(
    () => SCORE_CIRCUMFERENCE * (1 - Math.min(100, this.mvp()?.score ?? 0) / 100),
  );

  readonly myPlayers = computed(() => this.players().filter((p) => this.mine().has(p.actorId)));
  readonly champions = computed(() => roleChampions(this.players()));
  readonly awards = computed(() => computeAwards(this.players()));

  /** Joueurs triés du moins régulier au plus régulier sur les potions de combat. */
  readonly potionBoard = computed(() =>
    this.players()
      .filter((p) => p.potionEligiblePulls > 0)
      .map((p) => ({ player: p, status: potionStatus(p) }))
      .sort(
        (a, b) =>
          a.player.potionPulls / a.player.potionEligiblePulls -
            b.player.potionPulls / b.player.potionEligiblePulls ||
          a.player.name.localeCompare(b.player.name),
      ),
  );
  readonly potionCounts = computed(() => {
    const board = this.potionBoard();
    return {
      full: board.filter((b) => b.status === 'full').length,
      partial: board.filter((b) => b.status === 'partial').length,
      none: board.filter((b) => b.status === 'none').length,
    };
  });

  readonly deathBoard = computed(() => {
    const dying = this.players()
      .filter((p) => p.prematureDeaths > 0)
      .sort((a, b) => b.prematureDeaths - a.prematureDeaths || b.deaths - a.deaths);
    const max = dying[0]?.prematureDeaths ?? 1;
    return {
      rows: dying.map((p) => ({ player: p, width: (100 * p.prematureDeaths) / max })),
      clean: this.players().filter((p) => p.prematureDeaths === 0),
    };
  });

  readonly encounters = computed(() => {
    const pulls = new Map(this.analysis().pulls.map((p) => [p.id, p]));
    return this.analysis().encounters.map((e) => ({
      ...e,
      pulls: e.pullIds.map((id) => pulls.get(id)!).filter(Boolean),
      killPullId: e.pullIds.find((id) => pulls.get(id)?.kill) ?? null,
    }));
  });

  compact(value: number | null | undefined): string {
    return formatCompact(value, this.i18n.currentLocale());
  }

  awardValue(value: number, isParse = false): string {
    return isParse ? String(displayPercent(value)) : this.compact(value);
  }

  isMine(player: ReportPlayer): boolean {
    return this.mine().has(player.actorId);
  }
}
