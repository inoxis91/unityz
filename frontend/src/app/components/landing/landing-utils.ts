import { SHOT_SIZES } from './landing-shots';

/** Screenshots live in public/assets/landing/<locale>/ (see scripts/landing-screenshots.mjs). */
export type LandingShot = keyof (typeof SHOT_SIZES)['fr'];

export interface ShotSource {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

/** 1x image as fallback, 2x in srcset; width/height reserve the space (no layout shift). */
export function shotSource(shot: LandingShot, locale: string): ShotSource {
  const lang = locale === 'en' ? 'en' : 'fr';
  const base = `assets/landing/${lang}/${shot}`;
  const { width, height } = SHOT_SIZES[lang][shot];
  return {
    src: `${base}-sm.webp`,
    srcset: `${base}-sm.webp ${Math.round(width / 2)}w, ${base}.webp ${width}w`,
    width,
    height,
  };
}

/** Wraps around in both directions (carousel, roving tabindex). */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
