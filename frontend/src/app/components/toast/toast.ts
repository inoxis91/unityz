import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService, TOAST_DURATION_MS } from '../../services/toast';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite" aria-relevant="additions">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast"
          [class]="toast.type"
          [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
          animate.leave="toast-leave"
          (mouseenter)="toastService.pause(toast.id)"
          (mouseleave)="toastService.resume(toast.id)"
        >
          <span class="icon" aria-hidden="true">
            @switch (toast.type) {
              @case ('success') {
                ✓
              }
              @case ('error') {
                !
              }
              @default {
                i
              }
            }
          </span>
          <span class="message">{{ toast.message }}</span>
          <button
            type="button"
            class="close"
            (click)="toastService.remove(toast.id)"
            [attr.aria-label]="i18n.t('event.details.btn_close')"
          >
            ×
          </button>
          <span class="progress" aria-hidden="true" [style.animation-duration.ms]="duration"></span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .stack {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: min(420px, calc(100vw - 32px));
        pointer-events: none;
      }

      .toast {
        --tone: var(--ui-status-info);
        --tone-text: var(--ui-fg-blue-700);
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 12px 14px 14px;
        overflow: hidden;
        border: 1px solid var(--ui-border);
        border-radius: 16px;
        color: var(--ui-text-primary);
        background:
          radial-gradient(
            120% 140% at 0% 50%,
            color-mix(in srgb, var(--tone) 14%, transparent),
            transparent 60%
          ),
          var(--ui-surface);
        box-shadow: var(--ui-shadow-lg);
        pointer-events: auto;
        animation: toast-in 0.35s var(--ui-ease-spring);
      }

      .toast.success {
        --tone: var(--ui-status-success);
        --tone-text: var(--ui-fg-green-700);
      }

      .toast.error {
        --tone: var(--ui-status-danger);
        --tone-text: var(--ui-fg-red-700);
      }

      .icon {
        display: grid;
        flex-shrink: 0;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        font-size: 0.9rem;
        font-weight: 900;
        color: var(--ui-on-solid);
        background: var(--tone);
        animation: ui-pop 0.4s var(--ui-ease-spring) 0.1s backwards;
      }

      .message {
        flex: 1;
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1.4;
      }

      .close {
        display: grid;
        flex-shrink: 0;
        place-items: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 8px;
        font-size: 1.2rem;
        line-height: 1;
        color: var(--ui-text-muted);
        background: transparent;
        cursor: pointer;
      }

      .close:hover {
        color: var(--ui-text-strong);
        background: var(--ui-surface-subtle);
      }

      .close:focus-visible {
        outline: 3px solid var(--ui-focus);
        outline-offset: 1px;
      }

      /* Temps restant avant fermeture automatique (mis en pause au survol) */
      .progress {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        width: 100%;
        background: var(--tone);
        transform-origin: left;
        animation: countdown linear forwards;
      }

      .toast:hover .progress {
        animation-play-state: paused;
      }

      .toast.toast-leave {
        animation: toast-out 0.25s ease-in forwards;
      }

      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateX(40px) scale(0.96);
        }
      }

      @keyframes toast-out {
        to {
          opacity: 0;
          transform: translateX(40px);
        }
      }

      @keyframes countdown {
        to {
          transform: scaleX(0);
        }
      }

      @media (max-width: 640px) {
        .stack {
          top: auto;
          right: 16px;
          bottom: calc(16px + env(safe-area-inset-bottom));
        }
      }
    `,
  ],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly duration = TOAST_DURATION_MS;
}
