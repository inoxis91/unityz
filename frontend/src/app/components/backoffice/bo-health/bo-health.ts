import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { BackofficeService } from '../../../services/backoffice';
import { I18nService } from '../../../services/i18n';
import {
  formatBytes,
  formatDay,
  formatDuration,
  formatNumber,
  relativeTime,
} from '../backoffice-utils';

@Component({
  selector: 'app-bo-health',
  templateUrl: './bo-health.html',
  styleUrl: './bo-health.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoHealthComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);

  protected readonly data = rxResource({ stream: () => this.api.health() });

  protected bytes(value: number) {
    return formatBytes(value, this.i18n.currentLocale());
  }

  protected number(value: number) {
    return formatNumber(value, this.i18n.currentLocale());
  }

  protected when(iso: string) {
    return relativeTime(iso, this.i18n.currentLocale());
  }

  protected uptime(seconds: number) {
    return formatDuration(seconds, this.i18n.currentLocale());
  }

  protected date(iso: string | null) {
    return iso
      ? formatDay(iso.slice(0, 10), this.i18n.currentLocale(), {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';
  }
}
