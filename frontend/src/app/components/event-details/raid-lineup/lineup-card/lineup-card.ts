import { Component, computed, inject, input, output } from '@angular/core';
import { effectiveRole, Signup } from '../../../../services/calendar';
import { I18nService } from '../../../../services/i18n';
import { hasForcedRole, signupClassCss, signupDisplayName } from '../lineup-utils';

/** Carte joueur du line-up. Le drag & drop (cdkDrag) est porté par l'hôte, dans le parent. */
@Component({
  selector: 'app-lineup-card',
  standalone: true,
  templateUrl: './lineup-card.html',
  styleUrl: './lineup-card.css',
  host: {
    role: 'button',
    tabindex: '0',
    '[class]': 'hostClasses()',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class LineupCardComponent {
  public i18n = inject(I18nService);

  signup = input.required<Signup>();
  canManage = input(false);
  isMe = input(false);

  select = output<void>();
  bench = output<void>();

  role = computed(() => effectiveRole(this.signup()));
  name = computed(
    () => signupDisplayName(this.signup()) ?? this.i18n.t('event.details.unknown_user'),
  );
  forcedRole = computed(() => hasForcedRole(this.signup()));
  signedAs = computed(() =>
    this.i18n
      .t('event.lineup.signed_as')
      .replace('{role}', this.i18n.t('event.details.role_' + this.signup().role)),
  );

  hostClasses = computed(() => {
    const s = this.signup();
    return [
      signupClassCss(s),
      s.selection ? `is-${s.selection}` : 'is-pending',
      this.isMe() ? 'is-me' : '',
      this.canManage() ? 'is-draggable' : '',
    ].join(' ');
  });

  ariaLabel = computed(
    () => `${this.name()} — ${this.i18n.t('event.details.role_' + this.role())}`,
  );

  onQuick(event: Event, action: 'select' | 'bench'): void {
    event.stopPropagation();
    if (action === 'select') this.select.emit();
    else this.bench.emit();
  }
}
