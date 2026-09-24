import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export const TOAST_DURATION_MS = 5000;
const MAX_TOASTS = 4;

interface Timer {
  handle: ReturnType<typeof setTimeout>;
  startedAt: number;
  remaining: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 0;
  private readonly timers = new Map<number, Timer>();

  show(message: string, type: ToastType = 'info') {
    // Même message déjà affiché : on relance son minuteur plutôt que d'empiler un doublon
    const existing = this.toasts().find((t) => t.message === message && t.type === type);
    if (existing) {
      this.schedule(existing.id, TOAST_DURATION_MS);
      return;
    }

    const id = this.nextId++;
    this.toasts.update((current) => [...current, { id, message, type }].slice(-MAX_TOASTS));
    this.schedule(id, TOAST_DURATION_MS);
  }

  success(message: string) {
    this.show(message, 'success');
  }

  error(message: string) {
    this.show(message, 'error');
  }

  info(message: string) {
    this.show(message, 'info');
  }

  /** Suspend la fermeture automatique (survol). */
  pause(id: number) {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer.handle);
    timer.remaining -= Date.now() - timer.startedAt;
  }

  resume(id: number) {
    const timer = this.timers.get(id);
    if (timer) this.schedule(id, Math.max(1000, timer.remaining));
  }

  remove(id: number) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer.handle);
    this.timers.delete(id);
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  private schedule(id: number, delay: number) {
    const previous = this.timers.get(id);
    if (previous) clearTimeout(previous.handle);
    this.timers.set(id, {
      handle: setTimeout(() => this.remove(id), delay),
      startedAt: Date.now(),
      remaining: delay,
    });
  }
}
