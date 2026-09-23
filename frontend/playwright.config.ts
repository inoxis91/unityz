import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility smoke tests (axe-core) against a running stack:
 * `docker compose up -d` (or `npm start` + backend `npm run dev`), then `npm run e2e`.
 * Each project emulates an OS color scheme; ThemeService follows it when no choice is stored.
 */
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // Tests share one mock user and one seeded event
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    storageState: 'e2e/.auth/state.json',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'dark-mobile', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  ],
});
