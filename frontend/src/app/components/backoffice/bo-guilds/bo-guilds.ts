import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import {
  BackofficeService,
  GuildFilters,
  GuildRow,
  GuildState,
} from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import { openGuild } from '../backoffice';
import {
  FUNNEL_STAGES,
  GUILD_STATES,
  STATE_TONE,
  formatCents,
  formatDay,
  relativeDay,
} from '../backoffice-utils';

const SORTS: GuildFilters['sort'][] = ['created', 'activity', 'revenue', 'members', 'name'];
const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/** Filtres lus dans l'URL (source de vérité : lien partageable, retour arrière). */
function filtersFrom(params: Params): GuildFilters {
  const stage = params['stage'] !== undefined ? Number(params['stage']) : null;
  const sort = SORTS.includes(params['sort']) ? params['sort'] : 'created';
  return {
    search: params['q'] ?? '',
    state: GUILD_STATES.includes(params['state']) ? params['state'] : '',
    stage:
      stage !== null && Number.isInteger(stage) && stage >= 0 && stage < FUNNEL_STAGES.length
        ? stage
        : null,
    region: ['eu', 'us'].includes(params['region']) ? params['region'] : '',
    partner: params['partner'] === '1',
    sort,
    page: Math.max(1, Number(params['page']) || 1),
  };
}

@Component({
  selector: 'app-bo-guilds',
  templateUrl: './bo-guilds.html',
  styleUrl: './bo-guilds.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoGuildsComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly states = GUILD_STATES;
  protected readonly stages = FUNNEL_STAGES;
  protected readonly sorts = SORTS;
  protected readonly tone = STATE_TONE;

  private readonly params = toSignal(this.route.queryParams, { requireSync: true });
  protected readonly filters = computed(() => filtersFrom(this.params()));
  /** Texte saisi, en avance sur l'URL pendant le délai de frappe. */
  protected readonly searchText = linkedSignal(() => this.filters().search ?? '');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly data = rxResource({
    params: () => ({ ...this.filters(), v: this.api.version() }),
    stream: ({ params }) => this.api.guilds(params),
  });
  protected readonly page = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly pages = computed(() => {
    const p = this.page();
    return p ? Math.max(1, Math.ceil(p.total / PAGE_SIZE)) : 1;
  });
  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return !!(f.search || f.state || f.stage !== null || f.region || f.partner);
  });
  protected readonly exportUrl = computed(() => this.api.exportUrl(this.filters()));

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected onSearch(value: string) {
    this.searchText.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(
      () => this.update({ q: value.trim() || null }),
      SEARCH_DEBOUNCE_MS,
    );
  }

  protected setFilter(key: 'state' | 'stage' | 'region' | 'sort', event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.update({ [key]: value === '' ? null : value });
  }

  protected togglePartner() {
    this.update({ partner: this.filters().partner ? null : '1' });
  }

  protected reset() {
    this.searchText.set('');
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: 'guilds' } });
  }

  protected goTo(page: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  protected open(guild: GuildRow) {
    openGuild(this.router, this.route, guild.id);
  }

  protected stateLabel(state: GuildState) {
    return this.i18n.t('bo.state.' + state);
  }

  protected stageLabel(stage: number) {
    return this.i18n.t('bo.stage.' + FUNNEL_STAGES[stage]);
  }

  protected lastActive(day: string | null) {
    return day ? relativeDay(day, this.i18n.currentLocale()) : this.i18n.t('bo.guilds.never');
  }

  protected created(iso: string) {
    return formatDay(iso.slice(0, 10), this.i18n.currentLocale(), {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  }

  protected euro(cents: number) {
    return formatCents(cents, this.i18n.currentLocale());
  }

  /** Change un filtre et revient en page 1 (la page courante n'a plus de sens). */
  private update(changes: Params) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...changes, page: null },
      queryParamsHandling: 'merge',
      replaceUrl: 'q' in changes,
    });
  }
}
