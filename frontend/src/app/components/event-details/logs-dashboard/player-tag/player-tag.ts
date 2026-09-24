import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CharacterService } from '../../../../services/character';
import { I18nService } from '../../../../services/i18n';
import { RaidLogRole } from '../../../../services/raid-logs';
import { ROLE_ICONS } from '../raid-logs-insights';

/** Icône de classe, nom coloré, spécialisation et rôle d'un joueur du rapport. */
@Component({
  selector: 'app-player-tag',
  templateUrl: './player-tag.html',
  styleUrl: './player-tag.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'size-' + size()" },
})
export class PlayerTagComponent {
  readonly i18n = inject(I18nService);

  readonly player = input.required<{
    name: string;
    classId: string;
    spec: string | null;
    role: RaidLogRole;
  }>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly showSpec = input(true);
  readonly mine = input(false);

  readonly classIcon = computed(() => CharacterService.getClassIcon(this.player().classId));
  readonly roleIcon = computed(() => ROLE_ICONS[this.player().role]);
}
