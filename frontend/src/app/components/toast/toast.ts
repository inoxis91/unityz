import { Component } from '@angular/core';

import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="toast.type" (click)="toastService.remove(toast.id)">
          <span class="icon">
            @if (toast.type === 'success') {
              ✅
            } @else if (toast.type === 'error') {
              ❌
            } @else {
              ℹ️
            }
          </span>
          <span class="message">{{ toast.message }}</span>
          <button class="close-btn">×</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      }
      .toast {
        pointer-events: auto;
        min-width: 300px;
        max-width: 450px;
        padding: 16px;
        border-radius: 16px;
        background: var(--ui-surface);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        animation: slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: 1px solid var(--ui-border-subtle);
      }
      .toast.success {
        border-left: 6px solid var(--ui-status-success);
        background: var(--ui-bg-green-50);
        color: var(--ui-fg-green-800);
      }
      .toast.error {
        border-left: 6px solid var(--ui-status-danger);
        background: var(--ui-bg-red-50);
        color: var(--ui-fg-red-800);
      }
      .toast.info {
        border-left: 6px solid var(--ui-status-info);
        background: var(--ui-bg-blue-50);
        color: var(--ui-fg-blue-700);
      }

      .icon {
        font-size: 1.25rem;
      }
      .message {
        flex: 1;
        font-weight: 600;
        font-size: 0.95rem;
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 1.2rem;
        opacity: 0.5;
        cursor: pointer;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}
}
