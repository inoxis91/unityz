import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18nService, SupportedLocale } from '../../services/i18n';
import { AuthService } from '../../services/auth';
import { SeoService } from '../../services/seo';
import { PlanTier } from '../../constants/plans';
import { rememberPlan } from '../payment/payment-utils';
import { LandingShot, shotSource } from './landing-utils';
import { RevealDirective } from './reveal';
import { ShotFrameComponent } from './shot-frame/shot-frame';
import { MvpShowcaseComponent } from './mvp-showcase/mvp-showcase';
import { PricingPlansComponent } from './pricing-plans/pricing-plans';

interface FeatureRow {
  id: 'lineup' | 'mplus' | 'calendar';
  shot: LandingShot;
  path: string;
  icon: string;
  /** Index (1-based) of the bullet point that needs the Pro plan. */
  proPoint?: number;
}

const FEATURE_ROWS: readonly FeatureRow[] = [
  { id: 'lineup', shot: 'lineup', path: 'events/raid-mythique', icon: '🛡️', proPoint: 3 },
  { id: 'mplus', shot: 'mplus', path: 'events/soiree-cles', icon: '🗝️' },
  { id: 'calendar', shot: 'calendar', path: 'calendar', icon: '📅', proPoint: 3 },
];

const CHIPS = [
  ['🛡️', 'lineup'],
  ['✨', 'buffs'],
  ['🗝️', 'mplus'],
  ['📈', 'rio'],
  ['📊', 'wcl'],
  ['🏆', 'mvp'],
  ['💬', 'discord'],
  ['💰', 'fees'],
  ['⚒️', 'crafts'],
  ['🏖️', 'absences'],
  ['✅', 'attendance'],
  ['📖', 'directory'],
  ['👑', 'roles'],
  ['🌗', 'theme'],
] as const;

const MORE = [
  ['💰', 'fees', false],
  ['⚒️', 'crafts', false],
  ['🏖️', 'absences', false],
  ['✅', 'attendance', false],
  ['📊', 'parses', false],
  ['📖', 'directory', false],
  ['👑', 'roles', false],
  ['💬', 'discord', true],
  ['🌗', 'theme', false],
] as const;

const FAQ_COUNT = 7;

@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    RevealDirective,
    ShotFrameComponent,
    MvpShowcaseComponent,
    PricingPlansComponent,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements AfterViewInit {
  readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly topSentinel = viewChild.required<ElementRef<HTMLElement>>('topSentinel');
  /** The header turns opaque once the page is scrolled. */
  readonly scrolled = signal(false);

  readonly chips = CHIPS;
  readonly more = MORE;
  readonly faq = Array.from({ length: FAQ_COUNT }, (_, i) => i + 1);
  readonly year = new Date().getFullYear();

  readonly hero = computed(() => shotSource('overview', this.i18n.currentLocale()));
  readonly rows = computed(() => {
    const locale = this.i18n.currentLocale();
    return FEATURE_ROWS.map((row) => ({
      ...row,
      source: shotSource(row.shot, locale),
      points: [1, 2, 3].map((n) => ({
        label: `landing.${row.id}.point_${n}`,
        pro: row.proPoint === n,
      })),
    }));
  });

  constructor() {
    effect(() => {
      const isFr = this.i18n.currentLocale() === 'fr';
      this.seo.generateTags({
        title: isFr
          ? 'Gestion de guilde WoW : raid planner, line-up & classement MVP'
          : 'WoW guild management: raid planner, line-up & MVP ranking',
        description: isFr
          ? 'Calendrier et inscriptions, line-up de raid, groupes M+ avec Raider.io, analyse Warcraft Logs avec classement MVP, cotisations et bot Discord pour les guildes World of Warcraft.'
          : 'Calendar and sign-ups, raid line-up, M+ groups with Raider.io, Warcraft Logs analysis with an MVP ranking, guild fees and a Discord bot for World of Warcraft guilds.',
        keywords: isFr
          ? 'logiciel gestion guilde wow, raid planner wow, line-up raid wow, groupes mythique+, warcraft logs mvp, calendrier de raid wow, cotisations guilde wow, bot discord guilde'
          : 'wow guild management software, wow raid planner, wow raid line-up, mythic+ group builder, warcraft logs mvp, wow raid calendar, guild bank tracker, guild discord bot',
      });
    });

    // Already logged in: straight to the app
    this.authService.checkAuth().subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => {},
    });
  }

  ngAfterViewInit() {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) =>
      this.scrolled.set(!entry.isIntersecting),
    );
    observer.observe(this.topSentinel().nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  changeLang(lang: SupportedLocale) {
    this.i18n.setLocale(lang);
  }

  start(plan?: PlanTier) {
    if (plan) rememberPlan(plan);
    this.router.navigate(['/login']);
  }

  scrollTo(id: string) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
}
