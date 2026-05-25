import { Injectable, signal } from '@angular/core';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  resolve: (result: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  activeConfig = signal<ConfirmConfig | null>(null);

  ask(title: string, message: string, confirmText: string = 'Confirmer', cancelText: string = 'Annuler'): Promise<boolean> {
    return new Promise((resolve) => {
      this.activeConfig.set({
        title,
        message,
        confirmText,
        cancelText,
        resolve
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
