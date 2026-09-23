import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Signup } from '../../../services/calendar';
import { I18nService } from '../../../services/i18n';
import { CLASS_BUFFS, BuffInfo } from '../../../constants/wow';

export interface Buff extends BuffInfo {
  present: boolean;
  count: number;
}

export function computeBuffs(members: Signup[]): Buff[] {
  return CLASS_BUFFS.map((baseBuff) => {
    const count = members.filter((s) => baseBuff.classes.includes(s.character_class || '')).length;
    return { ...baseBuff, present: count > 0, count };
  });
}

/** Grille des buffs de raid (présents / manquants), partagée par la composition et le line-up. */
@Component({
  selector: 'app-raid-buffs',
  templateUrl: './raid-buffs.html',
  styleUrl: './raid-buffs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaidBuffsComponent {
  public i18n = inject(I18nService);

  readonly buffs = input.required<Buff[]>();
}
