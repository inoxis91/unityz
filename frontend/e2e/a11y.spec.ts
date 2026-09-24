import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readSeed } from './fixtures';

/**
 * WCAG 2.1 AA color contrast on every authenticated screen, in each project's color scheme,
 * plus a no-horizontal-overflow check on mobile. Tabs are opened one by one because inactive
 * tabs are not rendered.
 */

/** Waits for finite animations (fade-in, slide): axe and clicks need the settled layout. */
async function settle(page: Page) {
  // Two frames first, so animations triggered by the last interaction are registered
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function check(page: Page, label: string) {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')} → ${n.any[0]?.message ?? v.help}`),
  );
  expect.soft(report, `${label}: contrast violations`).toEqual([]);

  if (test.info().project.name.endsWith('mobile')) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect.soft(overflow, `${label}: horizontal overflow (px)`).toBeLessThanOrEqual(0);
  }
}

async function checkEachTab(page: Page, tabs: string, label: string) {
  const buttons = page.locator(`${tabs} > button`);
  await expect(buttons.first()).toBeVisible();
  for (let i = 0; i < (await buttons.count()); i++) {
    const tab = buttons.nth(i);
    await settle(page);
    await tab.click();
    await check(page, `${label} › ${(await tab.innerText()).trim()}`);
  }
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('main').waitFor();
  await page.waitForLoadState('networkidle');
}

test.beforeEach(async ({ page }) => {
  // Exercise the OS preference path: no stored explicit choice
  await page.addInitScript(() => localStorage.removeItem('guild_manager_theme'));
});

test('theme follows the emulated color scheme', async ({ page }, testInfo) => {
  await open(page, '/dashboard');
  const expected = testInfo.project.name.startsWith('dark') ? 'dark' : 'light';
  await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
});

for (const path of [
  '/dashboard',
  '/guild-characters',
  '/calendar',
  '/fees',
  '/crafts',
  '/absences',
]) {
  test(`readable ${path}`, async ({ page }) => {
    await open(page, path);
    await check(page, path);
  });
}

test('readable /dashboard › Warcraft Logs (all tabs)', async ({ page }) => {
  await open(page, '/dashboard');
  // Deferred on viewport: scrolling the placeholder loads the section
  await page.locator('.parses-placeholder').scrollIntoViewIfNeeded();
  const section = page.locator('app-dashboard-parses');
  // Demo data without WCL keys (CI), real data or a "not found" state with them
  await expect(section.locator('.wcl-card')).toBeVisible();
  await expect(section.locator('.skeleton')).toHaveCount(0);
  if (await section.locator('.tabs').count()) {
    await checkEachTab(page, 'app-dashboard-parses .tabs', '/dashboard › WCL');
  } else {
    await check(page, '/dashboard › WCL');
  }
});

test('readable /options (all tabs)', async ({ page }) => {
  await open(page, '/options');
  await checkEachTab(page, '.options-tabs', '/options');
});

test('readable /admin (all tabs)', async ({ page }) => {
  await open(page, '/admin');
  await checkEachTab(page, '.admin-tabs', '/admin');
});

test('readable /events/:id (all tabs)', async ({ page }) => {
  await open(page, `/events/${readSeed().eventId}`);
  await checkEachTab(page, '.tabs', '/events');
});
