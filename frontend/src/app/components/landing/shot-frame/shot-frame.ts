import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ShotSource } from '../landing-utils';

/** A screenshot in a browser-like window; without `source`, the projected content fills it. */
@Component({
  selector: 'app-shot-frame',
  template: `
    <div class="bar" aria-hidden="true">
      <span class="dots"><i></i><i></i><i></i></span>
      <span class="url">guild-manager.com/{{ path() }}</span>
    </div>
    <div class="viewport">
      @if (source(); as s) {
        <!-- loading/sizes are bound before src so the browser honours lazy loading -->
        <img
          [attr.loading]="priority() ? 'eager' : 'lazy'"
          [attr.fetchpriority]="priority() ? 'high' : null"
          decoding="async"
          [attr.sizes]="sizes()"
          [attr.srcset]="s.srcset"
          [src]="s.src"
          [width]="s.width"
          [height]="s.height"
          [alt]="alt()"
        />
      }
      <ng-content />
    </div>
  `,
  styleUrl: './shot-frame.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShotFrameComponent {
  readonly source = input<ShotSource | null>(null);
  readonly alt = input('');
  readonly path = input('');
  readonly sizes = input('(max-width: 820px) 100vw, 1160px');
  /** Above the fold: eager load with a high fetch priority. */
  readonly priority = input(false);
}
