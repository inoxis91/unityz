import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuditEntry, BackofficeService } from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import { openGuild } from '../backoffice';
import { formatDay, relativeTime } from '../backoffice-utils';

const ACTION_ICONS: Record<string, string> = {
  guild_viewed: '👁️',
  guilds_exported: '⬇️',
  extend_access: '⏳',
  reset_trial: '🎁',
  revoke_access: '⛔',
  note_updated: '📝',
};

@Component({
  selector: 'app-bo-audit',
  templateUrl: './bo-audit.html',
  styleUrl: './bo-audit.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoAuditComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly page = signal(1);
  protected readonly data = rxResource({
    params: () => ({ page: this.page(), v: this.api.version() }),
    stream: ({ params }) => this.api.audit(params.page),
  });
  protected readonly pages = computed(() =>
    this.data.hasValue()
      ? Math.max(1, Math.ceil(this.data.value().total / this.data.value().pageSize))
      : 1,
  );

  protected icon(action: string) {
    return ACTION_ICONS[action] ?? '•';
  }

  protected summary(entry: AuditEntry): string {
    const d = entry.details as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof d['days'] === 'number')
      parts.push(this.i18n.tf('bo.tl.days', { n: d['days'] as number }));
    if (d['tier']) parts.push(this.i18n.t('bo.tier.' + d['tier']));
    if (typeof d['is_partner'] === 'boolean') parts.push(d['is_partner'] ? '⭐' : '');
    return parts.filter(Boolean).join(' · ');
  }

  protected note(entry: AuditEntry): string {
    return String((entry.details as Record<string, unknown>)['note'] ?? '');
  }

  protected when(iso: string) {
    return relativeTime(iso, this.i18n.currentLocale());
  }

  protected date(iso: string) {
    return formatDay(iso.slice(0, 10), this.i18n.currentLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected open(id: string | null) {
    if (id) openGuild(this.router, this.route, id);
  }
}
