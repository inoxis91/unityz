import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CharacterService, GuildCharacterOverview } from '../../services/character';
import { I18nService } from '../../services/i18n';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import {
  DirectoryScope,
  Role,
  classDistribution,
  filterCharacters,
  groupByRole,
} from './guild-characters-utils';

@Component({
  selector: 'app-guild-characters',
  imports: [RouterModule, PageHeaderComponent],
  templateUrl: './guild-characters.html',
  styleUrl: './guild-characters.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuildCharactersComponent {
  readonly i18n = inject(I18nService);
  private readonly characterService = inject(CharacterService);

  private readonly baseRoles: Role[] = ['tank', 'heal', 'dps'];
  readonly scopes: DirectoryScope[] = ['mains', 'alts', 'all'];

  readonly allCharacters = signal<GuildCharacterOverview[]>([]);
  readonly loading = signal(true);

  readonly scope = signal<DirectoryScope>('mains');
  readonly query = signal('');
  readonly classFilter = signal<string | null>(null);

  readonly mains = computed(() => this.allCharacters().filter((c) => c.is_main));
  readonly alts = computed(() => this.allCharacters().filter((c) => !c.is_main));
  readonly players = computed(() => new Set(this.allCharacters().map((c) => c.owner_id)).size);

  private readonly classIdOf = (className: string) => CharacterService.getClassId(className);
  private readonly classLabelOf = (classId: string) => this.i18n.t('class.' + classId);

  /** Répartition des classes sur le périmètre choisi (mains, rerolls ou tous). */
  readonly distribution = computed(() => {
    const scope = this.scope();
    const pool =
      scope === 'mains' ? this.mains() : scope === 'alts' ? this.alts() : this.allCharacters();
    return classDistribution(pool, this.classIdOf);
  });

  readonly filtered = computed(() =>
    filterCharacters(
      this.allCharacters(),
      { scope: this.scope(), query: this.query(), classId: this.classFilter() },
      this.classIdOf,
      this.classLabelOf,
    ),
  );

  readonly columns = computed(() => groupByRole(this.filtered()));
  /** Colonne « rôle non défini » seulement si elle contient quelqu'un. */
  readonly roles = computed<Role[]>(() =>
    this.columns().none.length ? [...this.baseRoles, 'none'] : this.baseRoles,
  );

  // Rétrocompatibilité des vues « mains / rerolls par rôle » (utilisées par les tests)
  readonly mainTanks = computed(() => groupByRole(this.mains()).tank);
  readonly mainHealers = computed(() => groupByRole(this.mains()).heal);
  readonly altDps = computed(() => groupByRole(this.alts()).dps);

  constructor() {
    this.characterService.getGuildCharactersRoster().subscribe({
      next: (chars) => {
        this.allCharacters.set(chars);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[GuildCharacters] Error loading guild characters roster', err);
        this.loading.set(false);
      },
    });
  }

  toggleClass(classId: string) {
    this.classFilter.set(this.classFilter() === classId ? null : classId);
  }

  resetFilters() {
    this.query.set('');
    this.classFilter.set(null);
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  classIconById(classId: string): string {
    return CharacterService.getClassIcon(classId);
  }

  raiderIoUrl(c: GuildCharacterOverview): string {
    return this.characterService.getRaiderIoUrl(c.name, c.realm);
  }

  warcraftLogsUrl(c: GuildCharacterOverview): string {
    return this.characterService.getWarcraftLogsUrl(c.name, c.realm);
  }
}
