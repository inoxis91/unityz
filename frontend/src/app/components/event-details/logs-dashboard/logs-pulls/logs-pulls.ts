import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18nService } from '../../../../services/i18n';
import { RaidLogsAnalysis, ReportPlayer, ReportPullPlayer } from '../../../../services/raid-logs';
import {
  displayPercent,
  formatCompact,
  formatDuration,
  parseColorClass,
} from '../../../../shared/wcl/parse-tier';
import { PlayerTagComponent } from '../player-tag/player-tag';

const ABILITY_ICONS = 'https://assets.rpglogs.com/img/warcraft/abilities';

interface MeterRow {
  player: ReportPlayer;
  stats: ReportPullPlayer;
  amount: number;
  width: number;
}

/** Détail d'un pull : chronologie des morts, dégâts et soins par joueur. */
@Component({
  selector: 'app-logs-pulls',
  imports: [DecimalPipe, PlayerTagComponent],
  templateUrl: './logs-pulls.html',
  styleUrl: './logs-pulls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsPullsComponent {
  readonly i18n = inject(I18nService);

  readonly analysis = input.required<RaidLogsAnalysis>();
  readonly mine = input<Set<number>>(new Set());
  readonly selectedPullId = model<number | null>(null);

  readonly formatDuration = formatDuration;
  readonly parseColorClass = parseColorClass;
  readonly displayPercent = displayPercent;

  private readonly playersById = computed(
    () => new Map(this.analysis().players.map((p) => [p.actorId, p])),
  );

  /** Pulls regroupés par rencontre, numérotés dans l'ordre des essais. */
  readonly groups = computed(() => {
    const pulls = new Map(this.analysis().pulls.map((p) => [p.id, p]));
    return this.analysis().encounters.map((encounter) => ({
      encounter,
      pulls: encounter.pullIds
        .map((id, index) => ({ pull: pulls.get(id)!, attempt: index + 1 }))
        .filter((x) => !!x.pull),
    }));
  });

  readonly pull = computed(() => {
    const pulls = this.analysis().pulls;
    return pulls.find((p) => p.id === this.selectedPullId()) ?? pulls[0];
  });

  readonly encounter = computed(() =>
    this.analysis().encounters.find((e) => e.pullIds.includes(this.pull().id)),
  );
  readonly attempt = computed(() => (this.encounter()?.pullIds.indexOf(this.pull().id) ?? 0) + 1);

  readonly deaths = computed(() =>
    this.pull().deaths.map((d) => ({
      ...d,
      player: this.playersById().get(d.actorId),
      position: Math.min(100, (100 * d.timeMs) / Math.max(1, this.pull().durationMs)),
      iconUrl: d.abilityIcon ? `${ABILITY_ICONS}/${d.abilityIcon}` : null,
    })),
  );
  readonly prematureCount = computed(() => this.deaths().filter((d) => d.premature).length);

  readonly meters = computed(() => [
    {
      key: 'damage' as const,
      title: 'logs.stat.damage',
      icon: '⚔️',
      unit: 'logs.unit.dps',
      rows: this.meter((p) => p.dps),
    },
    {
      key: 'healing' as const,
      title: 'logs.stat.healing',
      icon: '💚',
      unit: 'logs.unit.hps',
      rows: this.meter((p) => p.hps).filter((row) => row.amount > 0),
    },
  ]);

  private meter(amount: (p: ReportPullPlayer) => number): MeterRow[] {
    const rows = this.pull()
      .players.map((stats) => ({
        stats,
        player: this.playersById().get(stats.actorId)!,
        amount: amount(stats),
        width: 0,
      }))
      .filter((row) => !!row.player)
      .sort((a, b) => b.amount - a.amount);
    const max = rows[0]?.amount || 1;
    return rows.map((row) => ({ ...row, width: (100 * row.amount) / max }));
  }

  compact(value: number): string {
    return formatCompact(value, this.i18n.currentLocale());
  }

  pullUrl(): string {
    return `${this.analysis().report.url}#fight=${this.pull().id}`;
  }

  hideImage(event: Event) {
    (event.target as HTMLElement).hidden = true;
  }
}
