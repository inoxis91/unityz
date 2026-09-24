import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Signup } from '../../../services/calendar';
import { I18nService } from '../../../services/i18n';
import { RaidBuffsComponent, computeBuffs } from '../raid-buffs/raid-buffs';
import { signupClassCss, signupDisplayName } from '../raid-lineup/lineup-utils';

/** Répartition des inscrits par rôle (événements hors raid et hors Mythique+). */
@Component({
  selector: 'app-composition',
  imports: [RaidBuffsComponent],
  templateUrl: './composition.html',
  styleUrl: './composition.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompositionComponent {
  public i18n = inject(I18nService);

  signups = input<Signup[]>([]);
  openAlts = output<Signup>();

  readonly columns = [
    { role: 'tank', header: 'event.details.header_tanks' },
    { role: 'heal', header: 'event.details.header_heals' },
    { role: 'dps', header: 'event.details.header_dps' },
  ] as const;

  private active = computed(() => this.signups().filter((s) => s.status === 'signed_up'));

  byRole = computed(() => {
    const byRole: Record<string, Signup[]> = { tank: [], heal: [], dps: [] };
    for (const s of this.active()) byRole[s.role]?.push(s);
    return byRole;
  });

  buffs = computed(() => computeBuffs(this.active()));

  displayName(s: Signup): string {
    return signupDisplayName(s) ?? this.i18n.t('event.details.unknown_user');
  }

  classCss(s: Signup): string {
    return signupClassCss(s);
  }
}
