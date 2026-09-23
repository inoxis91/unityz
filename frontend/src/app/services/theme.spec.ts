import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme';

describe('ThemeService', () => {
  const html = document.documentElement;

  const create = () => {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  };

  beforeEach(() => {
    localStorage.removeItem('guild_manager_theme');
    delete html.dataset['theme'];
    TestBed.resetTestingModule();
  });

  afterEach(() => localStorage.removeItem('guild_manager_theme'));

  it('restores a persisted choice and applies it to <html>', () => {
    localStorage.setItem('guild_manager_theme', 'dark');
    const service = create();

    expect(service.theme()).toBe('dark');
    expect(html.dataset['theme']).toBe('dark');
  });

  it('ignores invalid persisted values', () => {
    localStorage.setItem('guild_manager_theme', 'sepia');
    const service = create();

    expect(['light', 'dark']).toContain(service.theme());
  });

  it('toggles, persists and updates <html>', () => {
    localStorage.setItem('guild_manager_theme', 'light');
    const service = create();

    service.toggle();
    TestBed.tick();

    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem('guild_manager_theme')).toBe('dark');
    expect(html.dataset['theme']).toBe('dark');
  });
});
