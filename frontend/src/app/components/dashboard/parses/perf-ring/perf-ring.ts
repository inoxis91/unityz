import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CountUpDirective } from '../count-up';
import { parseColorClass } from '../parse-tier';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Jauge circulaire d'un percentile, colorée selon le palier Warcraft Logs. */
@Component({
  selector: 'app-perf-ring',
  imports: [CountUpDirective],
  templateUrl: './perf-ring.html',
  styleUrl: './perf-ring.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfRingComponent {
  readonly value = input.required<number | null>();
  readonly label = input.required<string>();
  readonly locale = input('fr');

  readonly radius = RADIUS;
  readonly circumference = CIRCUMFERENCE;
  readonly tier = computed(() => parseColorClass(this.value()));
  readonly dashOffset = computed(() => {
    const value = Math.min(100, Math.max(0, this.value() ?? 0));
    return CIRCUMFERENCE * (1 - value / 100);
  });
}
