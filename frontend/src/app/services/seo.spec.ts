import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LOCALIZED_PATHS, SeoService, absoluteUrl } from './seo';

describe('SeoService', () => {
  let seo: SeoService;
  let doc: Document;

  const attr = (selector: string, name = 'content') =>
    doc.head.querySelector(selector)?.getAttribute(name);

  beforeEach(() => {
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
  });

  it('builds absolute URLs from paths', () => {
    expect(absoluteUrl('/')).toBe('https://guild-manager.com/');
    expect(absoluteUrl('/en')).toBe('https://guild-manager.com/en');
    expect(absoluteUrl('assets/x.jpg')).toBe('https://guild-manager.com/assets/x.jpg');
  });

  it('sets title, canonical, preview tags and hreflang alternates', () => {
    seo.apply({
      title: 'Landing',
      description: 'Desc',
      path: '/en',
      locale: 'en',
      alternates: LOCALIZED_PATHS,
    });

    expect(doc.title).toBe('Landing');
    expect(attr('link[rel="canonical"]', 'href')).toBe('https://guild-manager.com/en');
    expect(attr('meta[property="og:url"]')).toBe('https://guild-manager.com/en');
    expect(attr('meta[property="og:image"]')).toBe(
      'https://guild-manager.com/assets/social/og-en.jpg',
    );
    expect(attr('meta[property="og:locale"]')).toBe('en_US');
    expect(attr('meta[name="robots"]')).toBe('index, follow');

    const alternates = [...doc.head.querySelectorAll('link[rel="alternate"][hreflang]')].map(
      (l) => `${l.getAttribute('hreflang')}=${l.getAttribute('href')}`,
    );
    expect(alternates).toEqual([
      'fr=https://guild-manager.com/',
      'en=https://guild-manager.com/en',
      'x-default=https://guild-manager.com/en',
    ]);
  });

  it('replaces previous tags instead of stacking them, and supports noindex', () => {
    seo.apply({
      title: 'A',
      description: 'A',
      path: '/',
      locale: 'fr',
      alternates: LOCALIZED_PATHS,
    });
    seo.apply({ title: 'Login', description: 'B', path: '/login', locale: 'fr', noindex: true });

    expect(doc.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(attr('link[rel="canonical"]', 'href')).toBe('https://guild-manager.com/login');
    expect(doc.head.querySelectorAll('link[rel="alternate"][hreflang]').length).toBe(0);
    expect(attr('meta[name="robots"]')).toBe('noindex');
  });
});
