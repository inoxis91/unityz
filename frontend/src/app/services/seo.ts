import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import type { SupportedLocale } from './i18n';

/** Production origin: canonical URLs and preview images must be absolute. */
export const SITE_URL = 'https://guild-manager.com';

/** Public page available in both languages: the landing lives at `/` (fr) and `/en`. */
export const LOCALIZED_PATHS: Record<SupportedLocale, string> = { fr: '/', en: '/en' };

const OG_LOCALE: Record<SupportedLocale, string> = { fr: 'fr_FR', en: 'en_US' };

export interface SeoConfig {
  title: string;
  description: string;
  /** Path of this page, e.g. `/terms`; the canonical URL is built from it. */
  path: string;
  locale: SupportedLocale;
  /** Other-language versions of the page (hreflang), including this one. */
  alternates?: Partial<Record<SupportedLocale, string>>;
  /** Path of the preview image under `public/`. */
  image?: string;
  /** Keeps the page out of search results (login, 404). */
  noindex?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  apply(config: SeoConfig) {
    const url = absoluteUrl(config.path);
    const image = absoluteUrl(config.image ?? `/assets/social/og-${config.locale}.jpg`);

    this.title.setTitle(config.title);
    this.meta.updateTag({ name: 'description', content: config.description });
    this.meta.updateTag({ name: 'robots', content: config.noindex ? 'noindex' : 'index, follow' });

    this.meta.updateTag({ property: 'og:title', content: config.title });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:locale', content: OG_LOCALE[config.locale] });
    this.meta.updateTag({ name: 'twitter:title', content: config.title });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setLink('canonical', url);
    this.setAlternates(config.alternates);
  }

  private setLink(rel: string, href: string) {
    let link = this.document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', rel);
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private setAlternates(alternates: SeoConfig['alternates']) {
    this.document.head
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((link) => link.remove());
    if (!alternates) return;

    // English is the fallback for every other language
    const entries = Object.entries(alternates);
    if (alternates.en) entries.push(['x-default', alternates.en]);
    for (const [hreflang, path] of entries) {
      const link = this.document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', absoluteUrl(path));
      this.document.head.appendChild(link);
    }
  }
}

export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
