import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PageTone = 'brand' | 'purple' | 'green' | 'amber' | 'red' | 'teal' | 'pink';

/**
 * En-tête commun des écrans connectés : icône, titre, sous-titre, puis deux emplacements projetés,
 * `[pageActions]` (boutons à droite) et `[pageStats]` (tuiles KPI sous le titre).
 */
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.html',
  styleUrl: './page-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'toneClass()' },
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Emoji ou court glyphe affiché dans la pastille. */
  readonly icon = input<string>();
  readonly tone = input<PageTone>('brand');

  protected readonly toneClass = computed(() => `tone-${this.tone()}`);
}
