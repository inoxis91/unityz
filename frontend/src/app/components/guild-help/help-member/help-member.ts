import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CharacterService } from '../../../services/character';

/** Membre de la guilde : icône et couleur de classe du personnage, BattleTag en secondaire. */
@Component({
  selector: 'app-help-member',
  templateUrl: './help-member.html',
  styleUrl: './help-member.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact()' },
})
export class HelpMemberComponent {
  readonly name = input<string | null>(null);
  readonly className = input<string | null>(null);
  readonly battletag = input.required<string>();
  /** Une seule ligne, sans BattleTag. */
  readonly compact = input(false);

  protected readonly classCss = computed(
    () => `class-${CharacterService.getClassId(this.className() ?? undefined)}`,
  );
  protected readonly icon = computed(() =>
    this.className() ? CharacterService.getClassIcon(this.className()!) : null,
  );
  protected readonly label = computed(() => this.name() || this.battletag().split('#')[0]);
}
