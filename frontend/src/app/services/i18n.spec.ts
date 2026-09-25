import { TestBed } from '@angular/core/testing';
import { I18nService, interpolate } from './i18n';

describe('interpolate', () => {
  it('replaces known placeholders and keeps unknown ones', () => {
    expect(interpolate('{n} rosters, {x}', { n: 2 })).toBe('2 rosters, {x}');
  });
});

describe('I18nService.tf', () => {
  it('translates then fills the placeholders', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('en');
    expect(i18n.tf('plans.feat.events', { n: 6 })).toBe('6 events per month');
  });
});

describe('I18nService.tIn', () => {
  it('translates in the requested language whatever the current one', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('fr');
    expect(i18n.tIn('en', 'landing.lang_suggest.action')).toBe('View in English');
    expect(i18n.t('landing.lang_suggest.action')).toBe('Voir en français');
  });
});
