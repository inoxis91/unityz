/**
 * Regenerates the link-preview images (public/assets/social/og-<locale>.jpg, 1200x630) and the
 * PNG icons (public/icons/*) from the landing screenshots and favicon. No running stack needed:
 *   node scripts/social-images.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const dataUri = (path, type) =>
  `data:${type};base64,${readFileSync(`${PUBLIC}${path}`).toString('base64')}`;

const LOGO = dataUri('favicon.ico', 'image/png');

const COPY = {
  fr: {
    title: ['Votre guilde WoW,', 'enfin organisée.'],
    tagline: 'Raid planner, line-up, groupes M+, analyse Warcraft Logs et bot Discord',
    badge: 'Serveurs EU & US',
  },
  en: {
    title: ['Your WoW guild,', 'finally organized.'],
    tagline: 'Raid planner, line-up, M+ groups, Warcraft Logs analysis and a Discord bot',
    badge: 'EU & US realms',
  },
};

const ogHtml = (locale) => {
  const { title, tagline, badge } = COPY[locale];
  const shot = dataUri(`assets/landing/${locale}/lineup.webp`, 'image/webp');
  return `<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body {
      width: 1200px; height: 630px; overflow: hidden; color: #f8fafc;
      font-family: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background:
        radial-gradient(circle at 12% 18%, rgba(99, 102, 241, 0.45), transparent 42%),
        radial-gradient(circle at 88% 92%, rgba(168, 85, 247, 0.4), transparent 45%),
        radial-gradient(circle at 70% 8%, rgba(234, 179, 8, 0.18), transparent 35%),
        #0b1020;
    }
    .copy { position: absolute; left: 64px; top: 64px; width: 560px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; }
    .brand img { width: 56px; height: 56px; border-radius: 14px; }
    h1 { margin-top: 60px; font-size: 54px; line-height: 1.08; letter-spacing: -1.5px; }
    h1 span { display: block; white-space: nowrap; }
    h1 .grad { background: linear-gradient(90deg, #818cf8, #c084fc, #fbbf24);
      -webkit-background-clip: text; color: transparent; }
    p { margin-top: 28px; font-size: 25px; line-height: 1.4; color: #cbd5e1; }
    .badge { position: absolute; left: 64px; bottom: 56px; padding: 10px 20px; border-radius: 999px;
      font-size: 22px; font-weight: 600; background: rgba(129, 140, 248, 0.18);
      border: 1px solid rgba(129, 140, 248, 0.5); }
    .shot { position: absolute; left: 650px; top: 80px; width: 720px; border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, 0.35); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
      transform: perspective(1400px) rotateY(-12deg) rotateX(4deg); transform-origin: left center; }
  </style></head><body>
    <div class="copy">
      <div class="brand"><img src="${LOGO}" alt="" />Guild Manager</div>
      <h1><span>${title[0]}</span><span class="grad">${title[1]}</span></h1>
      <p>${tagline}</p>
    </div>
    <span class="badge">${badge}</span>
    <img class="shot" src="${shot}" alt="" />
  </body></html>`;
};

const iconHtml = (size, padding) => `<!doctype html><html><head><style>
    * { margin: 0; } body { width: ${size}px; height: ${size}px; background: #0b1020;
      display: grid; place-items: center; }
    img { width: ${size - padding * 2}px; height: ${size - padding * 2}px; }
  </style></head><body><img src="${LOGO}" alt="" /></body></html>`;

// Google shows a favicon in results when it is a square multiple of 48px
const ICONS = [
  { file: 'icon-48.png', size: 48, padding: 0, transparent: true },
  { file: 'icon-192.png', size: 192, padding: 0, transparent: true },
  { file: 'icon-512.png', size: 512, padding: 0, transparent: true },
  { file: 'apple-touch-icon.png', size: 180, padding: 18, transparent: false },
];

const browser = await chromium.launch();
try {
  mkdirSync(`${PUBLIC}assets/social`, { recursive: true });
  mkdirSync(`${PUBLIC}icons`, { recursive: true });

  for (const locale of Object.keys(COPY)) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(ogHtml(locale), { waitUntil: 'load' });
    await page.screenshot({
      path: `${PUBLIC}assets/social/og-${locale}.jpg`,
      type: 'jpeg',
      quality: 85,
    });
    await page.close();
    console.log(`[social] og-${locale}.jpg`);
  }

  for (const { file, size, padding, transparent } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(iconHtml(size, padding), { waitUntil: 'load' });
    if (transparent) await page.addStyleTag({ content: 'body { background: transparent; }' });
    await page.screenshot({ path: `${PUBLIC}icons/${file}`, omitBackground: transparent });
    await page.close();
    console.log(`[social] ${file}`);
  }
} finally {
  await browser.close();
}
