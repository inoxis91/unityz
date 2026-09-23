import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18nService } from '../../../services/i18n';

export interface GuildBirthday {
  id: string;
  birthday: string;
  main_character: string;
}

/** Bandeau des anniversaires de la guilde (jour J mis en avant, sinon ceux du mois). */
@Component({
  selector: 'app-dashboard-birthdays',
  templateUrl: './birthdays.html',
  styleUrl: './birthdays.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardBirthdaysComponent {
  public i18n = inject(I18nService);

  readonly birthdays = input.required<GuildBirthday[]>();

  isBirthdayToday(birthdayStr: string): boolean {
    const parts = this.parse(birthdayStr);
    if (!parts) return false;
    const today = new Date();
    return parts.month === today.getMonth() + 1 && parts.day === today.getDate();
  }

  formatBirthdayDay(birthdayStr: string): string {
    const parts = this.parse(birthdayStr);
    if (!parts) return '';
    const date = new Date(2000, parts.month - 1, parts.day);
    const locale = this.i18n.currentLocale() === 'en' ? 'en-US' : 'fr-FR';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  }

  private parse(birthdayStr: string): { month: number; day: number } | null {
    if (!birthdayStr) return null;
    const parts = birthdayStr.substring(0, 10).split('-');
    if (parts.length < 3) return null;
    return { month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) };
  }
}
