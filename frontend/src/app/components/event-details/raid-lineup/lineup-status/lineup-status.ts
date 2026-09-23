import { Component, computed, inject, input } from '@angular/core';
import { effectiveRole, Signup } from '../../../../services/calendar';
import { I18nService } from '../../../../services/i18n';
import { hasForcedRole } from '../lineup-utils';

/** Bandeau « ma place dans le raid » affiché au joueur connecté. */
@Component({
  selector: 'app-lineup-status',
  standalone: true,
  templateUrl: './lineup-status.html',
  styleUrl: './lineup-status.css',
})
export class LineupStatusComponent {
  public i18n = inject(I18nService);

  signup = input.required<Signup>();

  state = computed(() => this.signup().selection ?? 'pending');
  role = computed(() => effectiveRole(this.signup()));
  forcedRoleNote = computed(() =>
    hasForcedRole(this.signup())
      ? this.i18n
          .t('event.lineup.my_status_forced')
          .replace('{role}', this.i18n.t('event.details.role_' + this.signup().role))
      : null,
  );

  readonly icons = { selected: '✅', benched: '🪑', pending: '⏳' } as const;
}
