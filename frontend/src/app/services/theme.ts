import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'guild_manager_theme';

/**
 * Holds the UI theme and mirrors it on <html data-theme>, which switches the --ui-* tokens
 * defined in styles.css. An explicit user choice is persisted; otherwise the OS preference wins.
 * index.html applies the same logic before bootstrap to avoid a flash of the wrong theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);
  private media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  private userChoice = signal<Theme | null>(this.readStoredChoice());
  private systemTheme = signal<Theme>(this.media?.matches ? 'dark' : 'light');

  readonly theme = computed<Theme>(() => this.userChoice() ?? this.systemTheme());
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.media?.addEventListener('change', (e) =>
      this.systemTheme.set(e.matches ? 'dark' : 'light'),
    );

    effect(() => {
      this.document.documentElement.setAttribute('data-theme', this.theme());
    });
  }

  toggle() {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  setTheme(theme: Theme) {
    this.userChoice.set(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage unavailable (private mode): the choice still applies for this session.
    }
  }

  private readStoredChoice(): Theme | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch {
      return null;
    }
  }
}
