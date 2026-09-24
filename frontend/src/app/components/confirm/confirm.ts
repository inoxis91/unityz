import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmService } from '../../services/confirm';

@Component({
  selector: 'app-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'confirmService.handle(false)' },
  template: `
    @if (confirmService.activeConfig(); as config) {
      <div class="backdrop" (click)="confirmService.handle(false)">
        <div
          class="dialog"
          [class.danger]="config.danger"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          (click)="$event.stopPropagation()"
        >
          <span class="icon" aria-hidden="true">{{ config.danger ? '⚠️' : '❔' }}</span>
          <h3 id="confirm-title">{{ config.title }}</h3>
          <p id="confirm-message">{{ config.message }}</p>
          <div class="footer">
            <button type="button" class="ui-btn ghost" (click)="confirmService.handle(false)">
              {{ config.cancelText }}
            </button>
            <button
              #confirmBtn
              type="button"
              class="ui-btn"
              [class.primary]="!config.danger"
              [class.danger]="config.danger"
              (click)="confirmService.handle(true)"
            >
              {{ config.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(4px);
        animation: ui-fade 0.15s ease-out;
      }

      .dialog {
        width: 100%;
        max-width: 440px;
        padding: 1.5rem;
        border: 1px solid var(--ui-border);
        border-radius: 22px;
        text-align: center;
        background:
          radial-gradient(
            90% 60% at 50% 0%,
            color-mix(in srgb, var(--ui-brand) 10%, transparent),
            transparent 70%
          ),
          var(--ui-surface);
        box-shadow: var(--ui-shadow-lg);
        animation: ui-sheet-in 0.22s var(--ui-ease-out);
      }

      .dialog.danger {
        background:
          radial-gradient(
            90% 60% at 50% 0%,
            color-mix(in srgb, var(--ui-danger) 12%, transparent),
            transparent 70%
          ),
          var(--ui-surface);
      }

      .icon {
        display: inline-grid;
        place-items: center;
        width: 52px;
        height: 52px;
        margin-bottom: 0.75rem;
        border-radius: 16px;
        font-size: 1.5rem;
        background: var(--ui-bg-blue-50);
        animation: ui-pop 0.4s var(--ui-ease-spring) 0.05s backwards;
      }

      .danger .icon {
        background: var(--ui-bg-red-50);
      }

      h3 {
        margin: 0 0 0.5rem;
        font-size: 1.2rem;
        font-weight: 900;
        color: var(--ui-text-strong);
      }

      p {
        margin: 0 0 1.5rem;
        line-height: 1.5;
        color: var(--ui-text-secondary);
      }

      .footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }

      @media (max-width: 640px) {
        .backdrop {
          align-items: flex-end;
          padding: 0;
        }

        .dialog {
          max-width: none;
          border-radius: 22px 22px 0 0;
          padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
        }
      }
    `,
  ],
})
export class ConfirmComponent {
  readonly confirmService = inject(ConfirmService);
  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  constructor() {
    // Focus sur l'action principale à l'ouverture (clavier : Entrée confirme, Échap annule)
    effect(() => {
      const btn = this.confirmBtn();
      if (btn) queueMicrotask(() => btn.nativeElement.focus());
    });
  }
}
