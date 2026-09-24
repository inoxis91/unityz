import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { RaidRole, Signup } from '../../../../services/calendar';
import { I18nService } from '../../../../services/i18n';
import { MplusPlayerCardComponent } from '../mplus-player-card/mplus-player-card';
import { MPLUS_GROUP_SIZE, MplusGroup, ScoreFn } from '../mplus-utils';

/** Un groupe M+ : 5 emplacements (1 tank, 1 heal, 3 DPS) formant une zone de dépôt. */
@Component({
  selector: 'app-mplus-group-card',
  imports: [DragDropModule, MplusPlayerCardComponent],
  templateUrl: './mplus-group-card.html',
  styleUrl: './mplus-group-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MplusGroupCardComponent {
  public i18n = inject(I18nService);

  group = input.required<MplusGroup>();
  scoreOf = input.required<ScoreFn>();
  /** Groupe tout juste créé : mis en évidence un instant. */
  highlighted = input(false);
  canManage = input(false);
  currentUserId = input<string | null>(null);
  /** Rôle du joueur en cours de drag : met en avant les emplacements libres correspondants. */
  draggingRole = input<RaidRole | null>(null);
  dragStartDelay = input<{ touch: number; mouse: number }>({ touch: 250, mouse: 0 });

  remove = output<void>();
  dropped = output<CdkDragDrop<number, unknown, Signup>>();
  cardActivate = output<Signup>();
  dragStarted = output<Signup>();
  dragEnded = output<void>();

  readonly groupSize = MPLUS_GROUP_SIZE;

  title = computed(() =>
    this.i18n.t('event.mplus.group_title').replace('{index}', String(this.group().index)),
  );
  fill = computed(() => Math.min(100, (this.group().members.length / MPLUS_GROUP_SIZE) * 100));

  /** Un groupe plein n'accepte plus de joueur venant d'ailleurs. */
  canEnter = (drag: CdkDrag<Signup>): boolean => {
    const g = this.group();
    return !g.isFull || g.members.some((m) => m.user_id === drag.data.user_id);
  };

  roleLabel(role: string): string {
    return this.i18n.t('event.details.role_' + role);
  }

  emptySlotLabel(role: string): string {
    return this.i18n.t('event.mplus.slot_free').replace('{role}', this.roleLabel(role));
  }
}
