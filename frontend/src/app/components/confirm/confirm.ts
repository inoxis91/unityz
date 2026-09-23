import { Component } from '@angular/core';

import { ConfirmService } from '../../services/confirm';

@Component({
  selector: 'app-confirm',
  standalone: true,
  imports: [],
  template: `
    @if (confirmService.activeConfig(); as config) {
      <div class="confirm-backdrop animated-fade-in">
        <div class="confirm-modal">
          <h3>{{ config.title }}</h3>
          <p>{{ config.message }}</p>
          <div class="confirm-footer">
            <button class="btn-secondary" (click)="confirmService.handle(false)">
              {{ config.cancelText }}
            </button>
            <button class="btn-primary" (click)="confirmService.handle(true)">
              {{ config.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .confirm-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(4px);
      }
      .confirm-modal {
        background: var(--ui-surface);
        padding: 2rem;
        border-radius: 24px;
        width: 100%;
        max-width: 450px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      }
      h3 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        font-weight: 800;
        color: var(--ui-text-primary);
      }
      p {
        margin: 0 0 2rem 0;
        color: var(--ui-text-muted);
        line-height: 1.5;
        font-weight: 500;
      }
      .confirm-footer {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
      }

      button {
        padding: 12px 24px;
        border-radius: 12px;
        font-weight: 700;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .btn-primary {
        background: #0074e0;
        color: white;
      }
      .btn-primary:hover {
        background: #0062be;
        transform: translateY(-2px);
      }
      .btn-secondary {
        background: var(--ui-surface-subtle);
        color: var(--ui-text-muted);
      }
      .btn-secondary:hover {
        background: var(--ui-surface-strong);
      }
    `,
  ],
})
export class ConfirmComponent {
  constructor(public confirmService: ConfirmService) {}
}
