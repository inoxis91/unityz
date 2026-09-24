import { shotSource, wrapIndex } from './landing-utils';
import { SHOT_SIZES } from './landing-shots';

describe('landing-utils', () => {
  describe('shotSource', () => {
    it('builds a localized 1x/2x source with the capture size', () => {
      const { width, height } = SHOT_SIZES.en.lineup;
      expect(shotSource('lineup', 'en')).toEqual({
        src: 'assets/landing/en/lineup-sm.webp',
        srcset: `assets/landing/en/lineup-sm.webp ${width / 2}w, assets/landing/en/lineup.webp ${width}w`,
        width,
        height,
      });
    });

    it('falls back to French for an unknown locale', () => {
      expect(shotSource('mplus', 'de').src).toBe('assets/landing/fr/mplus-sm.webp');
    });
  });

  describe('wrapIndex', () => {
    it('wraps forward and backward', () => {
      expect(wrapIndex(4, 4)).toBe(0);
      expect(wrapIndex(-1, 4)).toBe(3);
      expect(wrapIndex(2, 4)).toBe(2);
    });

    it('returns 0 for an empty list', () => {
      expect(wrapIndex(3, 0)).toBe(0);
    });
  });
});
