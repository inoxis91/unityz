import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Public pages are prerendered to static HTML at build time so crawlers and link previews
 * get real content. Everything else stays a client-rendered SPA served from index.csr.html.
 * Keep in sync with PRERENDERED_ROUTES in backend/src/index.ts and public/sitemap.xml.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'en', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
