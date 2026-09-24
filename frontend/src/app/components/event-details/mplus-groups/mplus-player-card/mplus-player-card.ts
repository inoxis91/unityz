import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Signup } from '../../../../services/calendar';
import { I18nService } from '../../../../services/i18n';
import { signupClassCss, signupDisplayName } from '../../raid-lineup/lineup-utils';
import { rioTier } from '../mplus-utils';

/** Carte joueur des groupes M+. Le drag & drop (cdkDrag) est porté par l'hôte, dans le parent. */
@Component({
  selector: 'app-mplus-player-card',
  templateUrl: './mplus-player-card.html',
  styleUrl: './mplus-player-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'button',
    tabindex: '0',
    '[class]': 'hostClasses()',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class MplusPlayerCardComponent {
  public i18n = inject(I18nService);

  signup = input.required<Signup>();
  score = input<number | null>(null);
  canManage = input(false);
  isMe = input(false);
  offRole = input(false);

  name = computed(
    () => signupDisplayName(this.signup()) ?? this.i18n.t('event.details.unknown_user'),
  );
  roleLabel = computed(() => this.i18n.t('event.details.role_' + this.signup().role));
  tier = computed(() => rioTier(this.score()));

  hostClasses = computed(() =>
    [
      signupClassCss(this.signup()),
      this.isMe() ? 'is-me' : '',
      this.offRole() ? 'is-off-role' : '',
      this.canManage() ? 'is-draggable' : '',
    ].join(' '),
  );

  ariaLabel = computed(() => {
    const score = this.score();
    return [
      this.name(),
      this.roleLabel(),
      score ? `${this.i18n.t('event.mplus.score')} ${score}` : '',
    ]
      .filter(Boolean)
      .join(' — ');
  });
}
