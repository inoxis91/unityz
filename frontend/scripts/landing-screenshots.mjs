/**
 * Regenerates the landing page screenshots (public/assets/landing/<locale>/*.webp).
 *
 * Needs the local stack (backend :3000 in non-prod with WCL keys, frontend :4200):
 *   node scripts/landing-screenshots.mjs
 *
 * The raid analysis comes from a real public Warcraft Logs report. Line-up, M+ groups and
 * calendar use a demo roster injected with page.route(), so nothing is written for them.
 */
import { chromium, request } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env['APP_URL'] ?? 'http://localhost:4200';
const API = process.env['API_URL'] ?? 'http://localhost:3000/api';
const PRO_GUILD_ID = '22222222-2222-4222-8222-222222222222';
const WCL_REPORT_URL = 'https://www.warcraftlogs.com/reports/7qRgKthjfGTN1MYA';
const OUT = new URL('../public/assets/landing/', import.meta.url).pathname;
const LOCALES = ['fr', 'en'];

async function ok(res, step) {
  if (!res.ok()) throw new Error(`[shots] ${step}: HTTP ${res.status()} ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Demo roster
// ---------------------------------------------------------------------------
const REALM = 'Hyjal';
const ROSTER = [
  ['Brisegarde', 'Warrior', 'tank', 'selected'],
  ['Thornhelm', 'Death Knight', 'tank', 'selected'],
  ['Lumenaïa', 'Priest', 'heal', 'selected'],
  ['Sylvenia', 'Druid', 'heal', 'selected'],
  ['Kaelyth', 'Evoker', 'heal', 'selected'],
  ['Aubelin', 'Paladin', 'heal', 'selected'],
  ['Vexmora', 'Warlock', 'dps', 'selected'],
  ['Pyrelle', 'Mage', 'dps', 'selected'],
  ['Ombrelame', 'Rogue', 'dps', 'selected'],
  ['Hakkan', 'Shaman', 'dps', 'selected'],
  ['Fenrys', 'Hunter', 'dps', 'selected'],
  ['Zul’kara', 'Demon Hunter', 'dps', 'selected'],
  ['Mei-Lin', 'Monk', 'dps', 'selected'],
  ['Arkhen', 'Death Knight', 'dps', 'selected'],
  ['Solveig', 'Paladin', 'dps', 'selected'],
  ['Nyxaria', 'Priest', 'dps', 'selected'],
  ['Grimbar', 'Warrior', 'dps', null],
  ['Elowen', 'Hunter', 'dps', null],
  ['Taurok', 'Shaman', 'heal', null],
  ['Ysolde', 'Mage', 'dps', 'benched'],
  ['Korvash', 'Demon Hunter', 'tank', 'benched'],
];

function signup(eventId, [name, cls, role, selection], i, extra = {}) {
  const now = new Date(Date.now() - (ROSTER.length - i) * 3600e3).toISOString();
  const characterId = `demo-char-${i}`;
  return {
    id: `demo-signup-${i}`,
    event_id: eventId,
    user_id: `demo_user_${i}`,
    character_id: characterId,
    role,
    status: 'signed_up',
    group_index: 0,
    comment: null,
    created_at: now,
    updated_at: now,
    selection,
    assigned_role: selection ? role : null,
    character_name: name,
    character_class: cls,
    character_realm: REALM,
    main_character_name: null,
    main_character_class: null,
    main_character_realm: null,
    battletag: `${name}#${1000 + i}`,
    signup_date: now,
    user_characters: [
      {
        id: characterId,
        name,
        realm: REALM,
        class: cls,
        is_tank: role === 'tank',
        is_heal: role === 'heal',
        is_dps: role === 'dps',
        is_main: true,
        roster_name: 'Mythique',
      },
    ],
    ...extra,
  };
}

// M+ : 2 groupes complets et 3 joueurs à placer
const MPLUS = [
  [0, 1],
  [2, 1],
  [6, 1],
  [7, 1],
  [8, 1],
  [1, 2],
  [3, 2],
  [9, 2],
  [10, 2],
  [11, 2],
  [20, 0],
  [12, 0],
  [5, 0],
];

function isoAt(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function demoEvents(locale) {
  const fr = locale === 'fr';
  const base = {
    description: '',
    roster_id: null,
    created_by: 'mock_user_6',
    invited_groups: [],
    is_canceled: false,
    canceled_reason: null,
    registrations_locked: false,
    logs: null,
    roster_name: null,
    roster_weight: null,
    mm_groups_count: 0,
  };
  const list = [];
  let n = 0;
  for (let offset = -24; offset <= 24; offset++) {
    const day = new Date(Date.now() + offset * 864e5).getDay();
    if (day === 3 || day === 0) {
      list.push({
        ...base,
        id: `demo-evt-${n++}`,
        type: 'raid',
        title: fr ? 'Raid Mythique' : 'Mythic Raid',
        start_time: isoAt(offset, 20, 45),
        end_time: isoAt(offset, 23, 30),
        roster_name: 'Mythique',
      });
    }
    if (day === 5) {
      list.push({
        ...base,
        id: `demo-evt-${n++}`,
        type: 'mm+',
        mm_groups_count: 3,
        title: fr ? 'Soirée clés M+' : 'M+ key night',
        start_time: isoAt(offset, 21),
        end_time: isoAt(offset, 23, 59),
      });
    }
    if (day === 2 && offset % 2 === 0) {
      list.push({
        ...base,
        id: `demo-evt-${n++}`,
        type: 'raid',
        title: fr ? 'Raid HM — reroll' : 'HC raid — alts',
        start_time: isoAt(offset, 21),
        end_time: isoAt(offset, 23),
      });
    }
    if (day === 1 && offset > 0 && offset < 8) {
      list.push({
        ...base,
        id: `demo-evt-${n++}`,
        type: 'reunion',
        title: fr ? 'Réunion officiers' : 'Officers meeting',
        start_time: isoAt(offset, 21),
        end_time: isoAt(offset, 22),
      });
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Seed (real data only for the raid analysis)
// ---------------------------------------------------------------------------
const api = await request.newContext({ baseURL: `${API}/` });
await ok(await api.post('mock-auth/login', { data: { mockUserId: 'mock_user_6' } }), 'mock login');
const guild = await ok(
  await api.post('users/active-guild', { data: { guildId: PRO_GUILD_ID } }),
  'select guild',
);
await ok(
  await api.post('users/import-characters', { data: { characters: guild.characters ?? [] } }),
  'import characters',
);
const start = new Date(Date.now() - 2 * 864e5);
const raid = await ok(
  await api.post('events', {
    data: {
      title: 'Raid Mythique',
      description: '',
      type: 'raid',
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + 3 * 3600e3).toISOString(),
      logs: WCL_REPORT_URL,
    },
  }),
  'create raid',
);
const mplus = await ok(
  await api.post('events', {
    data: {
      title: 'M+',
      description: '',
      type: 'mm+',
      mm_groups_count: 3,
      start_time: new Date(Date.now() + 2 * 864e5).toISOString(),
      end_time: new Date(Date.now() + 2 * 864e5 + 3 * 3600e3).toISOString(),
    },
  }),
  'create M+',
);
const state = await api.storageState();

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------
const HIDE = `app-support-widget, .app-banner, app-lineup-status, app-toast { display: none !important; }
app-raid-lineup, app-mplus-groups, app-logs-overview, app-logs-ranking { display: block; }
*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }`;

const browser = await chromium.launch();
const encoder = await browser.newPage();

/** PNG -> WebP via the browser's canvas encoder (no native image dependency). */
async function toWebp(png, scale = 1, quality = 0.82) {
  const b64 = await encoder.evaluate(
    async ({ data, scale, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const g = canvas.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    },
    { data: png.toString('base64'), scale, quality },
  );
  return Buffer.from(b64, 'base64');
}

/** Writes <name>.webp (2x) and <name>-sm.webp (1x) for srcset. */
const sizes = {};
async function save(locale, name, png) {
  const { width, height } = await encoder.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  }, png.toString('base64'));
  (sizes[locale] ??= {})[name] = { width, height };
  writeFileSync(`${OUT}${locale}/${name}.webp`, await toWebp(png));
  writeFileSync(`${OUT}${locale}/${name}-sm.webp`, await toWebp(png, 0.5));
  console.log(`[shots] ${locale}/${name}.webp`);
}

for (const locale of LOCALES) {
  mkdirSync(`${OUT}${locale}`, { recursive: true });
  const ctx = await browser.newContext({
    storageState: {
      ...state,
      origins: [
        {
          origin: APP,
          localStorage: [
            { name: 'guild_manager_locale', value: locale },
            { name: 'guild_manager_theme', value: 'dark' },
          ],
        },
      ],
    },
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    locale: locale === 'fr' ? 'fr-FR' : 'en-GB',
  });
  const page = await ctx.newPage();

  await page.route('https://raider.io/**', (route) =>
    route.fulfill({
      json: {
        mythic_plus_scores_by_season: [{ scores: { all: 2600 + Math.round(Math.random() * 800) } }],
      },
    }),
  );
  await page.route(`${API}/events/${mplus.id}/signups`, (route) =>
    route.fulfill({
      json: MPLUS.map(([idx, group], i) =>
        signup(mplus.id, ROSTER[idx], i, {
          group_index: group,
          selection: null,
          assigned_role: null,
          role: ROSTER[idx][2],
        }),
      ),
    }),
  );
  await page.route(`${API}/events/${raid.id}/signups`, (route) =>
    route.fulfill({ json: ROSTER.map((r, i) => signup(raid.id, r, i)) }),
  );
  await page.route(`${API}/events`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: demoEvents(locale) })
      : route.continue(),
  );

  async function open(url) {
    await page.goto(`${APP}${url}`);
    await page.addStyleTag({ content: HIDE });
    await page.waitForLoadState('networkidle');
  }

  async function capture(name, selector) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 60_000 });
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await save(locale, name, await el.screenshot());
  }

  /** Captures the page area spanning from the top of `from` to the bottom of `to`. */
  async function captureRange(name, from, to) {
    await page.locator(to).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const clip = await page.evaluate(
      ([a, b]) => {
        const r1 = document.querySelector(a).getBoundingClientRect();
        const r2 = document.querySelector(b).getBoundingClientRect();
        const x = Math.min(r1.left, r2.left);
        return {
          x,
          y: r1.top + scrollY,
          width: Math.max(r1.right, r2.right) - x,
          height: r2.bottom - r1.top,
        };
      },
      [from, to],
    );
    await save(locale, name, await page.screenshot({ clip, fullPage: true }));
  }

  // Raid analysis (real WCL report)
  await open(`/events/${raid.id}`);
  await page.locator('.ui-tabs button').last().click();
  await page.locator('app-logs-overview .mvp-grid').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await captureRange('overview', 'app-logs-overview .kpis', 'app-logs-overview .champions');
  await capture('awards', 'app-logs-overview .panel');
  await capture('progression', 'app-logs-overview section.panel >> nth=1');
  await capture('deaths', 'app-logs-overview .two-columns');
  await page.locator('app-logs-dashboard .tabs [role="tab"]').nth(1).click();
  await page.addStyleTag({
    content: 'app-logs-ranking .board > li:nth-child(n + 7) { display: none !important; }',
  });
  await capture('ranking', 'app-logs-ranking .board');

  // Raid line-up (demo roster)
  await open(`/events/${raid.id}`);
  await page.locator('.ui-tabs button').nth(1).click();
  await capture('lineup', 'app-raid-lineup');

  // M+ groups (demo roster)
  await open(`/events/${mplus.id}`);
  await page.locator('.ui-tabs button').nth(1).click();
  await capture('mplus', 'app-mplus-groups');

  // Calendar (demo events)
  await open('/calendar');
  await page.locator('.fc-daygrid-event').first().waitFor({ timeout: 60_000 });
  await capture('calendar', 'app-calendar .layout');

  await ctx.close();
}

// Cleanup the seeded events
await api.delete(`events/${raid.id}`);
await api.delete(`events/${mplus.id}`);
await api.dispose();
await browser.close();

writeFileSync(
  new URL('../src/app/components/landing/landing-shots.ts', import.meta.url),
  `// Generated by scripts/landing-screenshots.mjs, do not edit.\n` +
    `export const SHOT_SIZES = ${JSON.stringify(sizes, null, 2)} as const;\n`,
);
