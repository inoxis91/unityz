import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18nService } from '../../../services/i18n';
import { ChartPoint, formatDay, niceMax } from '../backoffice-utils';

/**
 * Histogramme d'une seule série (le titre de la carte la nomme, pas de légende). Survol ou
 * flèches du clavier pour lire une valeur ; un tableau masqué la rend aux lecteurs d'écran.
 */
@Component({
  selector: 'app-bo-chart',
  templateUrl: './bo-chart.html',
  styleUrl: './bo-chart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoChartComponent {
  private readonly i18n = inject(I18nService);

  readonly points = input.required<ChartPoint[]>();
  readonly label = input.required<string>();
  readonly format = input<(value: number) => string>((v) => String(v));

  protected readonly active = signal<number | null>(null);

  protected readonly max = computed(() =>
    niceMax(Math.max(0, ...this.points().map((p) => p.value))),
  );
  protected readonly bars = computed(() => {
    const max = this.max();
    return this.points().map((p) => ({ ...p, ratio: p.value / max }));
  });
  protected readonly ticks = computed(() => {
    const max = this.max();
    // Petits maximums : la mi-hauteur arrondie répéterait un libellé voisin (« 1, 1, 0 »)
    const ticks = [1, 0.5, 0].map((r) => ({ ratio: r, label: this.format()(max * r) }));
    return ticks.filter((t, i) => ticks.findIndex((o) => o.label === t.label) === i);
  });
  protected readonly total = computed(() => this.points().reduce((sum, p) => sum + p.value, 0));
  /** Libellés de l'axe des temps : début, milieu, fin. */
  protected readonly axis = computed(() => {
    const pts = this.points();
    if (!pts.length) return [];
    const idx = [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
    return idx.map((i) => ({
      left: pts.length > 1 ? i / (pts.length - 1) : 0.5,
      label: this.dayLabel(pts[i].day),
    }));
  });
  protected readonly tooltip = computed(() => {
    const i = this.active();
    const bar = i === null ? null : this.bars()[i];
    if (!bar) return null;
    return {
      // Gardé à l'intérieur du graphique aux extrémités
      left: Math.min(0.9, Math.max(0.1, (i! + 0.5) / this.bars().length)),
      title: this.periodLabel(bar),
      value: this.format()(bar.value),
    };
  });

  protected periodLabel(p: ChartPoint): string {
    const locale = this.i18n.currentLocale();
    if (p.day === p.until)
      return formatDay(p.day, locale, { weekday: 'short', day: 'numeric', month: 'short' });
    return this.i18n.tf('bo.chart.week_of', { date: formatDay(p.day, locale) });
  }

  protected dayLabel(day: string): string {
    return formatDay(day, this.i18n.currentLocale());
  }

  protected totalLabel(): string {
    return this.i18n.tf('bo.chart.total', { value: this.format()(this.total()) });
  }

  protected t(key: string): string {
    return this.i18n.t(key);
  }

  protected onKey(event: KeyboardEvent) {
    const count = this.bars().length;
    if (!count) return;
    const current = this.active() ?? (event.key === 'ArrowLeft' ? count : -1);
    const next =
      event.key === 'ArrowRight'
        ? Math.min(count - 1, current + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, current - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    this.active.set(next);
  }
}
