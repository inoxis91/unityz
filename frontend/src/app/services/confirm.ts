import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from './i18n';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  /** Action destructive : bouton de confirmation rouge. */
  danger: boolean;
  resolve: (result: boolean) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmService {
  private readonly i18n = inject(I18nService);
  readonly activeConfig = signal<ConfirmConfig | null>(null);

  ask(
    title: string,
    message: string,
    confirmText?: string,
    cancelText?: string,
    danger = false,
  ): Promise<boolean> {
    // Une nouvelle demande annule la précédente pour ne jamais laisser de promesse en suspens
    this.activeConfig()?.resolve(false);
    return new Promise((resolve) => {
      this.activeConfig.set({
        title,
        message,
        confirmText: confirmText ?? this.i18n.t('confirm.ok'),
        cancelText: cancelText ?? this.i18n.t('confirm.cancel'),
        danger,
        resolve,
      });
    });
  }

  handle(result: boolean) {
    const config = this.activeConfig();
    if (config) {
      config.resolve(result);
      this.activeConfig.set(null);
    }
  }
}
