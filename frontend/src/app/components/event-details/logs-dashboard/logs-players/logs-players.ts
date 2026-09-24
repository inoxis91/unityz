import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18nService } from '../../../../services/i18n';
import { RaidLogRole, RaidLogsAnalysis, ReportPlayer } from '../../../../services/raid-logs';
import { displayPercent, formatCompact, parseColorClass } from '../../../../shared/wcl/parse-tier';
import { PlayerTagComponent } from '../player-tag/player-tag';
import { ROLES, potionStatus } from '../raid-logs-insights';

export type PlayerSortKey =
  | 'rank'
  | 'name'
  | 'itemLevel'
  | 'avgParse'
  | 'bestParse'
  | 'dps'
  | 'hps'
  | 'prematureDeaths'
  | 'potions'
  | 'interrupts'
  | 'dispels'
  | 'healthstones';

const SORT_VALUE: Record<PlayerSortKey, (p: ReportPlayer) => number | string | null> = {
  rank: (p) => p.rank,
  name: (p) => p.name.toLocaleLowerCase(),
  itemLevel: (p) => p.itemLevel,
  avgParse: (p) => p.avgParse,
  bestParse: (p) => p.bestParse,
  dps: (p) => p.dps,
  hps: (p) => p.hps,
  prematureDeaths: (p) => p.prematureDeaths * 1000 + p.deaths,
  potions: (p) => (p.potionEligiblePulls ? p.potionPulls / p.potionEligiblePulls : null),
  interrupts: (p) => p.interrupts,
  dispels: (p) => p.dispels,
  healthstones: (p) => p.healthstones,
};

/** Ordre naturel à la première activation d'une colonne : croissant pour le rang et le nom. */
const ASCENDING_FIRST = new Set<PlayerSortKey>(['rank', 'name', 'prematureDeaths']);

/** Tableau triable de toutes les statistiques des joueurs sur la soirée. */
@Component({
  selector: 'app-logs-players',
  imports: [DecimalPipe, PlayerTagComponent],
  templateUrl: './logs-players.html',
  styleUrl: './logs-players.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsPlayersComponent {
  readonly i18n = inject(I18nService);

  readonly analysis = input.required<RaidLogsAnalysis>();
  readonly mine = input<Set<number>>(new Set());

  readonly filters = ['all', ...ROLES] as const;
  readonly parseColorClass = parseColorClass;
  readonly displayPercent = displayPercent;
  readonly potionStatus = potionStatus;

  readonly roleFilter = signal<RaidLogRole | 'all'>('all');
  readonly search = signal('');
  readonly sortKey = signal<PlayerSortKey>('rank');
  readonly sortAsc = signal(true);

  readonly columns: { key: PlayerSortKey; label: string; numeric?: boolean }[] = [
    { key: 'itemLevel', label: 'logs.stat.ilvl', numeric: true },
    { key: 'avgParse', label: 'logs.stat.avg_parse', numeric: true },
    { key: 'bestParse', label: 'logs.stat.best_parse', numeric: true },
    { key: 'dps', label: 'logs.unit.dps', numeric: true },
    { key: 'hps', label: 'logs.unit.hps', numeric: true },
    { key: 'prematureDeaths', label: 'logs.stat.deaths', numeric: true },
    { key: 'potions', label: 'logs.stat.potions', numeric: true },
    { key: 'healthstones', label: 'logs.stat.healthstones', numeric: true },
    { key: 'interrupts', label: 'logs.stat.interrupts', numeric: true },
    { key: 'dispels', label: 'logs.stat.dispels', numeric: true },
  ];

  readonly rows = computed(() => {
    const role = this.roleFilter();
    const query = this.search().trim().toLocaleLowerCase();
    const value = SORT_VALUE[this.sortKey()];
    const direction = this.sortAsc() ? 1 : -1;
    return this.analysis()
      .players.filter(
        (p) =>
          (role === 'all' || p.role === role) &&
          (!query || p.name.toLocaleLowerCase().includes(query)),
      )
      .sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        // Valeurs absentes toujours en bas, quel que soit le sens.
        if (va === null || vb === null) return va === vb ? a.rank - b.rank : va === null ? 1 : -1;
        if (va === vb) return a.rank - b.rank;
        return (va < vb ? -1 : 1) * direction;
      });
  });

  sortBy(key: PlayerSortKey) {
    if (this.sortKey() === key) {
      this.sortAsc.update((asc) => !asc);
    } else {
      this.sortKey.set(key);
      this.sortAsc.set(ASCENDING_FIRST.has(key));
    }
  }

  ariaSort(key: PlayerSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortAsc() ? 'ascending' : 'descending';
  }

  sortIcon(key: PlayerSortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortAsc() ? '▲' : '▼';
  }

  compact(value: number): string {
    return value ? formatCompact(value, this.i18n.currentLocale()) : '—';
  }

  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }
}
