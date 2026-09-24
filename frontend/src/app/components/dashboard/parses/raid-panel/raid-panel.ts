import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18nService } from '../../../../services/i18n';
import { RaidZonePerformance, WclMetric } from '../../../../services/wcl-performance';
import {
  displayPercent,
  formatCompact,
  formatDuration,
  parseColorClass,
  topPercent,
} from '../parse-tier';

/** Tableau des boss d'une zone de raid : meilleur %, médiane, DPS/HPS, kills, temps, All Stars. */
@Component({
  selector: 'app-wcl-raid-panel',
  imports: [DecimalPipe],
  templateUrl: './raid-panel.html',
  styleUrl: './raid-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WclRaidPanelComponent {
  readonly i18n = inject(I18nService);

  readonly zone = input.required<RaidZonePerformance>();
  readonly metric = input.required<WclMetric>();

  readonly parseColorClass = parseColorClass;
  readonly displayPercent = displayPercent;
  readonly formatDuration = formatDuration;
  readonly topPercent = topPercent;

  compact(value: number | null): string {
    return formatCompact(value, this.i18n.currentLocale());
  }

  hideBrokenImage(event: Event) {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
