import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../../../services/i18n';
import { MvpBreakdown } from '../../../../services/raid-logs';
import { contributions } from '../raid-logs-insights';

/** Barre empilée du score MVP : chaque segment représente les points apportés par un critère. */
@Component({
  selector: 'app-score-bar',
  templateUrl: './score-bar.html',
  styleUrl: './score-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreBarComponent {
  readonly i18n = inject(I18nService);

  readonly breakdown = input.required<MvpBreakdown>();
  readonly weights = input.required<MvpBreakdown>();

  readonly segments = computed(() => contributions(this.breakdown(), this.weights()));
  readonly label = computed(() =>
    this.segments()
      .map(
        (s) => `${this.i18n.t('logs.criterion.' + s.criterion)} ${s.points.toFixed(1)}/${s.weight}`,
      )
      .join(', '),
  );
}
