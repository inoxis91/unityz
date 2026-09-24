import { DestroyRef, Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';

const DURATION_MS = 900;

/**
 * Anime un nombre de sa valeur précédente vers la nouvelle (ease-out) et écrit le texte formaté
 * dans l'élément hôte. Sans animation si l'utilisateur préfère réduire les mouvements.
 */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective {
  readonly appCountUp = input.required<number | null>();
  readonly countUpDecimals = input(0);
  readonly countUpLocale = input('fr');
  /** Texte affiché quand la valeur est nulle. */
  readonly countUpEmpty = input('—');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private current = 0;
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));

    effect(() => {
      const target = this.appCountUp();
      const decimals = this.countUpDecimals();
      const format = new Intl.NumberFormat(this.countUpLocale(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      untracked(() => this.animate(target, format));
    });
  }

  private animate(target: number | null, format: Intl.NumberFormat) {
    cancelAnimationFrame(this.frame);
    if (target === null) {
      this.current = 0;
      this.host.textContent = this.countUpEmpty();
      return;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = this.current;
    if (reduceMotion || from === target) {
      this.current = target;
      this.host.textContent = format.format(target);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.current = from + (target - from) * eased;
      this.host.textContent = format.format(this.current);
      if (progress < 1) this.frame = requestAnimationFrame(step);
      else this.current = target;
    };
    this.frame = requestAnimationFrame(step);
  }
}
