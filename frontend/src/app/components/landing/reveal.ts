import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Adds `.revealed` the first time the element scrolls into view. Styles decide what that means
 * (see `.reveal` in landing.css); without IntersectionObserver the content is shown right away.
 */
@Directive({ selector: '[appReveal]', host: { class: 'reveal' } })
export class RevealDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit() {
    const node = this.el.nativeElement;
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('revealed');
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        node.classList.add('revealed');
        this.observer?.disconnect();
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    this.observer.observe(node);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
