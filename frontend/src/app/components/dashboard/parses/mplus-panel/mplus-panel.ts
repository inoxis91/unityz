import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18nService } from '../../../../services/i18n';
import { MythicPlusPerformance } from '../../../../services/wcl-performance';
import {
  displayPercent,
  formatCompact,
  formatDuration,
  parseColorClass,
  topPercent,
} from '../../../../shared/wcl/parse-tier';

/** Grille des donjons Mythique+ : meilleure clé, score, classement et parse DPS/HPS par niveau. */
@Component({
  selector: 'app-wcl-mplus-panel',
  imports: [DecimalPipe],
  templateUrl: './mplus-panel.html',
  styleUrl: './mplus-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WclMplusPanelComponent {
  readonly i18n = inject(I18nService);

  readonly data = input.required<MythicPlusPerformance>();

  /** Donjons joués d'abord, par score décroissant, puis les autres par nom. */
  readonly dungeons = computed(() =>
    [...this.data().dungeons].sort(
      (a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.en.localeCompare(b.name.en),
    ),
  );

  readonly parseColorClass = parseColorClass;
  readonly displayPercent = displayPercent;
  readonly formatDuration = formatDuration;
  readonly topPercent = topPercent;

  compact(value: number | null | undefined): string {
    return formatCompact(value, this.i18n.currentLocale());
  }

  hideBrokenImage(event: Event) {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
