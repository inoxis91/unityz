import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { Character, CharacterService } from '../../../services/character';
import { I18nService } from '../../../services/i18n';

export type ParseColor = 'pink' | 'orange' | 'purple' | 'blue' | 'green' | 'gray';

/** Palier de couleur Warcraft Logs d'un percentile. */
export function parseColorClass(percentile: number | null | undefined): ParseColor {
  if (percentile === undefined || percentile === null) return 'gray';
  if (percentile >= 99) return 'pink';
  if (percentile >= 90) return 'orange';
  if (percentile >= 75) return 'purple';
  if (percentile >= 50) return 'blue';
  if (percentile >= 30) return 'green';
  return 'gray';
}

/** Carte des parses Warcraft Logs d'un des personnages du joueur (raid par difficulté ou donjons). */
@Component({
  selector: 'app-dashboard-parses',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './parses.html',
  styleUrl: './parses.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardParsesComponent {
  public i18n = inject(I18nService);
  public characterService = inject(CharacterService);

  readonly characters = input.required<Character[]>();

  readonly mainCharacter = computed(() => this.characters().find((c) => c.is_main));

  /** Main par défaut, réinitialisé quand la liste de personnages change. */
  readonly selectedCharacterId = linkedSignal(
    () => (this.mainCharacter() ?? this.characters()[0])?.id ?? '',
  );
  readonly selectedDifficulty = signal(5); // Mythique par défaut
  readonly parsesTab = signal<'raid' | 'dungeon'>('raid');

  readonly selectedCharacter = computed(
    () =>
      this.characters().find((c) => c.id === this.selectedCharacterId()) ?? this.mainCharacter(),
  );

  /** Annule la requête précédente quand le personnage ou la difficulté change. */
  readonly parses = rxResource({
    params: () => ({ id: this.selectedCharacterId(), difficulty: this.selectedDifficulty() }),
    stream: ({ params }) =>
      params.id ? this.characterService.getCharacterParses(params.id, params.difficulty) : of(null),
  });

  readonly parseColorClass = parseColorClass;

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  onCharacterChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.selectedCharacterId.set(value);
  }

  onDifficultyChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.selectedDifficulty.set(parseInt(value, 10));
  }
}
