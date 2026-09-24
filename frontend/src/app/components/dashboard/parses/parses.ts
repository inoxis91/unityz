import {
  ChangeDetectionStrategy,
  Component,
  ResourceRef,
  Signal,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { Character, CharacterService } from '../../../services/character';
import { I18nService } from '../../../services/i18n';
import {
  MythicPlusPerformance,
  RaidPerformance,
  RaidZonePerformance,
  WclMetric,
  WclPerformanceService,
  WclSpecRanking,
} from '../../../services/wcl-performance';
import { CountUpDirective } from '../../../shared/wcl/count-up';
import { WclMplusPanelComponent } from './mplus-panel/mplus-panel';
import { parseColorClass, topPercent } from '../../../shared/wcl/parse-tier';
import { PerfRingComponent } from '../../../shared/wcl/perf-ring/perf-ring';
import { WclRaidPanelComponent } from './raid-panel/raid-panel';

export type PerformanceTab = 'raid' | 'mplus';

/** Difficultés proposées ; `null` = la plus haute avec des kills (comportement par défaut de WCL). */
export const RAID_DIFFICULTIES: readonly (number | null)[] = [null, 5, 4, 3];

type ErrorKind = 'not_found' | 'hidden' | 'unavailable';

/** Soins par défaut pour un personnage déclaré uniquement soigneur, dégâts sinon. */
export function defaultMetric(character: Character | undefined): WclMetric {
  return character?.is_heal && !character.is_dps && !character.is_tank ? 'hps' : 'dps';
}

/**
 * Garde la dernière valeur pendant un rechargement du même personnage (changement de difficulté,
 * de métrique…) pour éviter de vider l'écran ; la vide quand le personnage change.
 */
function keepWhileReloading<T>(resource: ResourceRef<T | undefined>, key: Signal<string>) {
  return linkedSignal<{ key: string; value: T | undefined }, T | undefined>({
    source: () => ({ key: key(), value: resource.hasValue() ? resource.value() : undefined }),
    computation: (current, previous) =>
      current.value ??
      (previous && previous.source.key === current.key ? previous.value : undefined),
  });
}

function errorKind(error: unknown): ErrorKind {
  const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
  if (code === 'WCL_CHARACTER_NOT_FOUND') return 'not_found';
  if (code === 'WCL_CHARACTER_HIDDEN') return 'hidden';
  return 'unavailable';
}

/** Performances Warcraft Logs (raid + Mythique+) d'un des personnages du joueur. */
@Component({
  selector: 'app-dashboard-parses',
  imports: [
    CountUpDirective,
    DecimalPipe,
    PerfRingComponent,
    RouterLink,
    WclMplusPanelComponent,
    WclRaidPanelComponent,
  ],
  templateUrl: './parses.html',
  styleUrl: './parses.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardParsesComponent {
  readonly i18n = inject(I18nService);
  private readonly characterService = inject(CharacterService);
  private readonly wcl = inject(WclPerformanceService);

  readonly characters = input.required<Character[]>();

  readonly difficulties = RAID_DIFFICULTIES;
  readonly parseColorClass = parseColorClass;
  readonly topPercent = topPercent;

  /** Main d'abord, puis ordre alphabétique (déjà trié par l'API). */
  readonly selectedCharacterId = linkedSignal(
    () => (this.characters().find((c) => c.is_main) ?? this.characters()[0])?.id ?? '',
  );
  readonly selectedCharacter = computed(() =>
    this.characters().find((c) => c.id === this.selectedCharacterId()),
  );

  readonly tab = signal<PerformanceTab>('raid');
  readonly difficulty = signal<number | null>(null);
  readonly metric = linkedSignal(() => defaultMetric(this.selectedCharacter()));
  readonly spec = linkedSignal<string, string | null>({
    source: this.selectedCharacterId,
    computation: () => null,
  });
  readonly selectedZoneId = signal<number | null>(null);

  readonly raid = rxResource({
    params: () => {
      const id = this.selectedCharacterId();
      return id
        ? { id, difficulty: this.difficulty(), metric: this.metric(), spec: this.spec() }
        : undefined;
    },
    stream: ({ params }) => this.wcl.getRaid(params.id, params),
  });

  readonly mythicPlus = rxResource({
    params: () => {
      const id = this.selectedCharacterId();
      return id ? { id, metric: this.metric() } : undefined;
    },
    stream: ({ params }) => this.wcl.getMythicPlus(params.id, params.metric),
  });

  readonly raidData = keepWhileReloading<RaidPerformance>(this.raid, this.selectedCharacterId);
  readonly mplusData = keepWhileReloading<MythicPlusPerformance>(
    this.mythicPlus,
    this.selectedCharacterId,
  );

  readonly raidError = computed(() => (this.raid.error() ? errorKind(this.raid.error()) : null));
  readonly mplusError = computed(() =>
    this.mythicPlus.error() ? errorKind(this.mythicPlus.error()) : null,
  );
  /** Personnage absent ou masqué sur WCL : un seul message pour toute la carte. */
  readonly characterError = computed(() => {
    const kind = this.raidError() ?? this.mplusError();
    return kind === 'not_found' || kind === 'hidden' ? kind : null;
  });

  readonly activeZone = computed<RaidZonePerformance | undefined>(() => {
    const zones = this.raidData()?.zones ?? [];
    return zones.find((z) => z.zone.id === this.selectedZoneId()) ?? zones[0];
  });

  readonly topRaidSpec = computed(() => this.activeZone()?.allStars[0]);
  readonly topMplusSpec = computed(() => this.mplusData()?.specs[0]);

  /** Spécialisations connues du personnage (All Stars raid et M+), pour le filtre. */
  readonly knownSpecs = linkedSignal<{ id: string; specs: string[] }, string[]>({
    source: () => ({
      id: this.selectedCharacterId(),
      specs: [...(this.activeZone()?.allStars ?? []), ...(this.mplusData()?.specs ?? [])].map(
        (s) => s.spec,
      ),
    }),
    computation: (current, previous) => {
      const carried = previous?.source.id === current.id ? previous.value : [];
      return [...new Set([...carried, ...current.specs])];
    },
  });

  readonly isDemo = computed(
    () => this.raidData()?.source === 'mock' || this.mplusData()?.source === 'mock',
  );

  readonly wclUrl = computed(() => {
    const c = this.selectedCharacter();
    return this.characterService.getWarcraftLogsUrl(c?.name, c?.realm);
  });

  readonly seasonLabel = computed(() => {
    const locale = this.i18n.currentLocale();
    return [
      ...(this.raidData()?.zones ?? []).map((z) => z.zone.name[locale]),
      this.mplusData()?.zone.name[locale],
    ]
      .filter(Boolean)
      .join(' · ');
  });

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  difficultyLabel(difficulty: number | null): string {
    if (difficulty !== null) return this.i18n.t('difficulty.' + difficulty);
    const auto = this.i18n.t('wcl.difficulty_auto');
    // La difficulté retenue par WCL n'a de sens que si « Auto » est sélectionné.
    const effective = this.difficulty() === null ? this.activeZone()?.difficulty : null;
    return effective ? `${auto} (${this.i18n.t('difficulty.' + effective)})` : auto;
  }

  specRankingTitle(spec: WclSpecRanking): string {
    const top = topPercent(spec.rank, spec.total);
    return `${spec.spec} — ${this.i18n.t('wcl.top')} ${top?.toFixed(1) ?? '—'} %`;
  }

  selectCharacter(id: string | undefined) {
    if (id) this.selectedCharacterId.set(id);
  }

  retry() {
    if (this.raid.error()) this.raid.reload();
    if (this.mythicPlus.error()) this.mythicPlus.reload();
  }
}
