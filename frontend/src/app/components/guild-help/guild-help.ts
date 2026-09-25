import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, filter, fromEvent } from 'rxjs';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import {
  GuildHelpService,
  HelpApplication,
  HelpCategory,
  HelpKind,
  HelpPair,
  HelpPost,
} from '../../services/guild-help';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import { HelpApplyDialogComponent, HelpApplyRequest } from './help-apply-dialog/help-apply-dialog';
import { HelpPairCardComponent } from './help-pair-card/help-pair-card';
import { HelpPostCardComponent } from './help-post-card/help-post-card';
import { HelpPostFormComponent } from './help-post-form/help-post-form';
import {
  MAX_OPEN_POSTS,
  countByCategory,
  filterPosts,
  helpErrorKey,
  helpStats,
  isMyPair,
  postState,
} from './guild-help-utils';

type Tab = 'requests' | 'offers' | 'mine' | 'pairs';
const TABS: readonly Tab[] = ['requests', 'offers', 'mine', 'pairs'];
const TAB_KIND: Partial<Record<Tab, HelpKind>> = { requests: 'request', offers: 'offer' };

type FormState = { kind: HelpKind; post: HelpPost | null };

@Component({
  selector: 'app-guild-help',
  imports: [
    PageHeaderComponent,
    HelpPostCardComponent,
    HelpPairCardComponent,
    HelpPostFormComponent,
    HelpApplyDialogComponent,
  ],
  templateUrl: './guild-help.html',
  styleUrl: './guild-help.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuildHelpComponent {
  readonly helpService = inject(GuildHelpService);
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly tabs = TABS;
  readonly maxOpenPosts = MAX_OPEN_POSTS;

  readonly tab = signal<Tab>(parseTab(this.route.snapshot.queryParamMap.get('tab')));
  /** Filtre de catégorie, remis à zéro à chaque changement d'onglet. */
  readonly category = linkedSignal<Tab, HelpCategory | null>({
    source: this.tab,
    computation: () => null,
  });
  readonly form = signal<FormState | null>(null);
  readonly applyTarget = signal<HelpPost | null>(null);

  readonly userId = computed(() => this.auth.currentUser()?.id);
  readonly canModerate = computed(() => this.auth.isAdmin() || this.auth.isGMOrOfficer());

  private readonly overview = this.helpService.overview;
  readonly stats = computed(() => helpStats(this.overview(), this.userId()));

  readonly tabKind = computed(() => TAB_KIND[this.tab()] ?? null);
  readonly categoryCounts = computed(() => {
    const kind = this.tabKind();
    return kind ? countByCategory(this.overview().posts, kind) : [];
  });
  readonly listedPosts = computed(() => {
    const kind = this.tabKind();
    return kind ? filterPosts(this.overview().posts, kind, this.category()) : [];
  });

  readonly myPosts = computed(() =>
    this.overview().posts.filter((p) => p.author_user_id === this.userId()),
  );
  readonly myPendingPosts = computed(() =>
    this.overview().posts.filter((p) => p.my_application_status === 'pending'),
  );
  readonly applicationsByPost = computed(() => {
    const map = new Map<string, HelpApplication[]>();
    for (const a of this.overview().applications) {
      map.set(a.post_id, [...(map.get(a.post_id) ?? []), a]);
    }
    return map;
  });

  readonly myPairs = computed(() =>
    this.overview().pairs.filter((p) => isMyPair(p, this.userId())),
  );
  readonly guildPairs = computed(() =>
    this.overview().pairs.filter((p) => !isMyPair(p, this.userId())),
  );

  readonly tabCounts = computed<Record<Tab, number>>(() => {
    const s = this.stats();
    return {
      requests: s.openRequests,
      offers: s.openOffers,
      mine: s.toReview,
      pairs: s.myPairs,
    };
  });

  constructor() {
    this.helpService.load().subscribe({
      error: (err) => {
        console.error('[GuildHelp] Error loading guild help', err);
        this.helpService.loaded.set(true);
        this.toast.error(this.i18n.t('help.toast.load_error'));
      },
    });

    // Retour sur l'onglet du navigateur : on récupère les nouvelles annonces et candidatures
    const document = inject(DOCUMENT);
    fromEvent(document, 'visibilitychange')
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.helpService.refresh());
  }

  stateOf(post: HelpPost) {
    return postState(post, this.userId(), this.overview().pairs);
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'requests' ? null : tab },
      replaceUrl: true,
    });
  }

  toggleCategory(category: HelpCategory): void {
    this.category.set(this.category() === category ? null : category);
  }

  openCreate(kind: HelpKind = this.tabKind() ?? 'request'): void {
    if (this.stats().myOpenPosts >= MAX_OPEN_POSTS) {
      this.toast.error(this.i18n.t('help.error.HELP_QUOTA_REACHED'));
      return;
    }
    this.form.set({ kind, post: null });
  }

  openEdit(post: HelpPost): void {
    this.form.set({ kind: post.kind, post });
  }

  submitApplication({ post, characterId, message }: HelpApplyRequest): void {
    this.applyTarget.set(null);
    this.helpService.apply(post.id, characterId, message).subscribe({
      next: () => this.toast.success(this.i18n.t(`help.toast.applied_${post.kind}`)),
      error: (err) => {
        console.error('[GuildHelp] Error applying', err);
        this.toast.error(this.i18n.t(helpErrorKey(err, 'help.toast.action_error')));
      },
    });
  }

  withdraw(post: HelpPost): void {
    this.run(this.helpService.withdraw(post.id), 'help.toast.withdrawn');
  }

  async closePost(post: HelpPost): Promise<void> {
    const moderating = post.author_user_id !== this.userId();
    const ok = await this.confirm.ask(
      this.i18n.t(moderating ? 'help.confirm.moderate_close_title' : 'help.confirm.close_title'),
      this.i18n.tf('help.confirm.close_desc', { title: post.title }),
      this.i18n.t('help.card.close'),
      undefined,
      true,
    );
    if (ok) this.run(this.helpService.closePost(post.id), 'help.toast.closed');
  }

  decide(event: { application: HelpApplication; decision: 'accept' | 'decline' }): void {
    this.run(
      this.helpService.decide(event.application, event.decision),
      event.decision === 'accept' ? 'help.toast.accepted' : 'help.toast.declined',
    );
  }

  async endPair(pair: HelpPair): Promise<void> {
    const mine = isMyPair(pair, this.userId());
    const ok = await this.confirm.ask(
      this.i18n.t(mine ? 'help.confirm.end_title' : 'help.confirm.moderate_end_title'),
      this.i18n.t(mine ? 'help.confirm.end_desc' : 'help.confirm.moderate_end_desc'),
      this.i18n.t('help.pair.end'),
      undefined,
      true,
    );
    if (ok) this.run(this.helpService.endPair(pair), 'help.toast.pair_ended');
  }

  private run(request$: Observable<void>, successKey: string): void {
    request$.subscribe({
      next: () => this.toast.success(this.i18n.t(successKey)),
      error: (err) => {
        console.error('[GuildHelp] Action failed', err);
        this.toast.error(this.i18n.t(helpErrorKey(err, 'help.toast.action_error')));
      },
    });
  }
}

function parseTab(value: string | null): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : 'requests';
}
