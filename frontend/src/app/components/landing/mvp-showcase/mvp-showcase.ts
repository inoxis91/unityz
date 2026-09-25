import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '../../../services/i18n';
import { LandingShot, shotSource, wrapIndex } from '../landing-utils';
import { ShotFrameComponent } from '../shot-frame/shot-frame';

interface ShowcaseTab {
  id: string;
  shot: LandingShot;
  icon: string;
  label: string;
  desc: string;
}

const TABS: readonly ShowcaseTab[] = [
  {
    id: 'ranking',
    shot: 'ranking',
    icon: '🏆',
    label: 'landing.mvp.tab_ranking',
    desc: 'landing.mvp.ranking_desc',
  },
  {
    id: 'awards',
    shot: 'awards',
    icon: '🎖️',
    label: 'landing.mvp.tab_awards',
    desc: 'landing.mvp.awards_desc',
  },
  {
    id: 'deaths',
    shot: 'deaths',
    icon: '🧪',
    label: 'landing.mvp.tab_deaths',
    desc: 'landing.mvp.deaths_desc',
  },
  {
    id: 'progression',
    shot: 'progression',
    icon: '⚔️',
    label: 'landing.mvp.tab_progression',
    desc: 'landing.mvp.progression_desc',
  },
];

/** Time each tab stays on screen while auto-playing (kept in sync with --autoplay in the CSS). */
export const AUTOPLAY_MS = 7000;

@Component({
  selector: 'app-mvp-showcase',
  imports: [ShotFrameComponent],
  templateUrl: './mvp-showcase.html',
  styleUrl: './mvp-showcase.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mouseenter)': 'hovered.set(true)',
    '(mouseleave)': 'hovered.set(false)',
    '(focusin)': 'hovered.set(true)',
    '(focusout)': 'hovered.set(false)',
  },
})
export class MvpShowcaseComponent {
  readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly tabs = TABS;
  readonly active = signal(0);
  /** Explicit pause from the button; hover/focus only suspend the timer. */
  readonly paused = signal(
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  /** No autoplay while prerendering: a pending timer would keep the app from ever being stable. */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly hovered = signal(false);
  readonly running = computed(() => this.isBrowser && !this.paused() && !this.hovered());

  readonly current = computed(() => this.tabs[this.active()]);
  readonly sources = computed(() => {
    const locale = this.i18n.currentLocale();
    return this.tabs.map((tab) => ({
      ...shotSource(tab.shot, locale),
      alt: this.i18n.tf('landing.mvp.shot_alt', { tab: this.i18n.t(tab.label) }),
    }));
  });

  constructor() {
    // Re-armed on every tab change and on resume, like the progress bar that restarts with it
    effect((onCleanup) => {
      if (!this.running()) return;
      this.active();
      const timer = setTimeout(
        () => this.active.update((i) => wrapIndex(i + 1, TABS.length)),
        AUTOPLAY_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });

    // Compact layout: keep the active pill visible in the horizontal strip (never scrolls the page)
    effect(() => {
      const index = this.active();
      const strip = this.host.nativeElement.querySelector<HTMLElement>('[role="tablist"]');
      const tab = strip?.querySelectorAll<HTMLElement>('[role="tab"]')[index];
      if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
      strip.scrollTo({ left: tab.offsetLeft - 8, behavior: 'smooth' });
    });
  }

  select(index: number) {
    this.active.set(wrapIndex(index, this.tabs.length));
  }

  /** Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern). */
  onKeydown(event: KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowRight: this.active() + 1,
      ArrowLeft: this.active() - 1,
      Home: 0,
      End: this.tabs.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    this.select(moves[event.key]);
    this.host.nativeElement
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [this.active()]?.focus();
  }

  togglePause() {
    this.paused.update((p) => !p);
  }
}
