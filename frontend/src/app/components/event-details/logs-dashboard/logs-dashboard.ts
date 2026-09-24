import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { rxResource } from '@angular/core/rxjs-interop';
import { I18nService } from '../../../services/i18n';
import { RaidLogsService } from '../../../services/raid-logs';
import { formatDuration } from '../../../shared/wcl/parse-tier';
import { LogsOverviewComponent } from './logs-overview/logs-overview';
import { LogsPlayersComponent } from './logs-players/logs-players';
import { LogsPullsComponent } from './logs-pulls/logs-pulls';
import { LogsRankingComponent } from './logs-ranking/logs-ranking';
import { matchMyPlayers } from './raid-logs-insights';

export type LogsTab = 'overview' | 'ranking' | 'players' | 'pulls';

type ErrorKind = 'not_found' | 'invalid_url' | 'unavailable' | 'generic';

const TABS: { id: LogsTab; icon: string }[] = [
  { id: 'overview', icon: '📊' },
  { id: 'ranking', icon: '👑' },
  { id: 'players', icon: '🧙' },
  { id: 'pulls', icon: '🐉' },
];

function errorKind(error: unknown): ErrorKind {
  const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
  switch (code) {
    case 'WCL_REPORT_NOT_FOUND':
    case 'LOGS_NOT_FOUND':
      return 'not_found';
    case 'WCL_INVALID_URL':
      return 'invalid_url';
    case 'WCL_UNAVAILABLE':
      return 'unavailable';
    default:
      return 'generic';
  }
}

/** Onglet « Logs & Analyses » d'un raid : synthèse du rapport Warcraft Logs et classement MVP. */
@Component({
  selector: 'app-logs-dashboard',
  imports: [LogsOverviewComponent, LogsRankingComponent, LogsPlayersComponent, LogsPullsComponent],
  templateUrl: './logs-dashboard.html',
  styleUrl: './logs-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsDashboardComponent {
  readonly i18n = inject(I18nService);
  private readonly raidLogs = inject(RaidLogsService);

  readonly eventId = input.required<string>();
  /** Personnages de l'utilisateur, pour mettre en avant ses performances. */
  readonly myCharacters = input<{ name: string; realm?: string | null }[]>([]);

  readonly tabs = TABS;
  readonly tab = signal<LogsTab>('overview');
  readonly selectedPullId = signal<number | null>(null);

  readonly analysis = rxResource({
    params: () => ({ id: this.eventId(), locale: this.i18n.currentLocale() }),
    stream: ({ params }) => this.raidLogs.getAnalysis(params.id, params.locale),
  });

  readonly data = computed(() => (this.analysis.hasValue() ? this.analysis.value() : undefined));
  readonly error = computed(() =>
    this.analysis.error() ? errorKind(this.analysis.error()) : null,
  );
  readonly mine = computed(() => matchMyPlayers(this.data()?.players ?? [], this.myCharacters()));

  readonly reportDate = computed(() => {
    const data = this.data();
    if (!data) return '';
    return new Intl.DateTimeFormat(this.i18n.currentLocale(), { dateStyle: 'full' }).format(
      new Date(data.report.startTime),
    );
  });

  readonly formatDuration = formatDuration;

  openPull(pullId: number) {
    this.selectedPullId.set(pullId);
    this.tab.set('pulls');
  }

  hideImage(event: Event) {
    (event.target as HTMLElement).hidden = true;
  }
}
