import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { environment } from '../../../environments/environment';
import { PLANS, PlanTier, formatPrice, planFeatures } from '../../constants/plans';
import {
  PlanContext,
  formatBillingDate,
  initialPlan,
  isPlanSelectable,
  paymentMode,
  takeRememberedPlan,
} from './payment-utils';
import { BillingService, CheckoutPreview, PlanChangePreview } from '../../services/billing';
import { AnalyticsService, FeedbackAnswer } from '../../services/analytics';
import { FeedbackSurveyComponent } from '../../shared/feedback-survey/feedback-survey';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, RouterModule, FeedbackSurveyComponent],
  templateUrl: './payment.html',
  styleUrl: './payment.css',
})
export class PaymentComponent implements OnInit {
  public authService = inject(AuthService);
  public i18n = inject(I18nService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private billing = inject(BillingService);
  private analytics = inject(AnalyticsService);

  isProcessing = signal(false);
  verifyingSession = signal(false);
  verificationSuccess = signal<boolean | null>(null);
  /** The one-time trial is greyed out once the guild has used it. */
  readonly trialAvailable = computed(
    () => this.authService.currentUser()?.active_guild_free_trial_available !== false,
  );
  /** Running subscription, current plan and scheduled cancellation of the active guild. */
  readonly planContext = computed<PlanContext>(() => {
    const user = this.authService.currentUser();
    const subscribed = !!user?.active_guild_has_subscription;
    return {
      trialAvailable: this.trialAvailable(),
      subscribed,
      currentTier: subscribed ? (user?.subscription_tier ?? null) : null,
      canceled: subscribed && user?.subscription_status === 'canceled',
    };
  });
  selectedTier = signal<PlanTier>(initialPlan(takeRememberedPlan(), this.planContext()));
  readonly mode = computed(() => paymentMode(this.selectedTier(), this.planContext().subscribed));
  /** Undoing a scheduled cancellation by picking the current plan again. */
  readonly reactivating = computed(
    () => this.mode() === 'change' && this.selectedTier() === this.planContext().currentTier,
  );
  /** Amounts of the selected paid plan, from Stripe (customer credit, carried access, proration). */
  readonly quote = rxResource<
    { kind: 'checkout'; data: CheckoutPreview } | { kind: 'change'; data: PlanChangePreview },
    { tier: 'medium' | 'pro'; mode: 'checkout' | 'change' } | undefined
  >({
    params: () => {
      const tier = this.selectedTier();
      const mode = this.mode();
      if (tier === 'free' || mode === 'trial' || !this.authService.isGMOrOfficer())
        return undefined;
      return { tier, mode };
    },
    stream: ({ params }) =>
      params.mode === 'change'
        ? this.billing
            .changePreview(params.tier)
            .pipe(map((data) => ({ kind: 'change' as const, data })))
        : this.billing
            .checkoutPreview(params.tier)
            .pipe(map((data) => ({ kind: 'checkout' as const, data }))),
  });
  readonly checkoutQuote = computed(() => {
    const q = this.quote.hasValue() ? this.quote.value() : undefined;
    return q?.kind === 'checkout' ? q.data : null;
  });
  /** Reactivating costs nothing; a downgrade leaves a credit, an upgrade charges the proration. */
  readonly changeAmountLabel = computed(() => {
    if (this.reactivating()) return 'payment.due_today';
    return (this.changeQuote()?.amount ?? 0) < 0
      ? 'payment.change_credit_label'
      : 'payment.change_due_label';
  });
  readonly changeQuote = computed(() => {
    const q = this.quote.hasValue() ? this.quote.value() : undefined;
    return q?.kind === 'change' ? q.data : null;
  });
  /** Questionnaire « qu'est-ce qui vous retient ? » (back-office : raisons de non-conversion). */
  survey = signal<'payment_exit' | 'trial_end' | null>(null);
  surveyBusy = signal(false);
  private viewTracked = false;
  /** Snapshot taken on submit: the user refresh after a plan change flips the live flag. */
  private hadSubscription = false;
  private apiUrl = environment.apiUrl;

  readonly plans = computed(() => {
    const locale = this.i18n.currentLocale();
    return PLANS.map((plan) => ({
      ...plan,
      price: formatPrice(plan.priceCents, locale),
      features: planFeatures(plan.tier).map((f) => ({
        ...f,
        label: this.i18n.tf(f.key, { n: f.count ?? '' }),
      })),
    }));
  });
  readonly selectedPlan = computed(
    () => this.plans().find((p) => p.tier === this.selectedTier()) ?? this.plans()[0],
  );
  readonly confirmText = computed(() => {
    const plan = this.i18n.t('plans.name.' + this.selectedTier());
    if (this.mode() !== 'change') return this.i18n.tf('payment.confirm_plan', { plan });
    if (this.reactivating()) return this.i18n.tf('payment.reactivate_subtitle', { plan });
    const current = this.i18n.t('plans.name.' + this.planContext().currentTier);
    return this.i18n.tf('payment.change_subtitle', { plan, current });
  });
  readonly canSubmit = computed(() => isPlanSelectable(this.selectedTier(), this.planContext()));
  readonly verificationState = computed(() => {
    const ok = this.verificationSuccess();
    return ok === null ? 'pending' : ok ? 'success' : 'error';
  });

  ngOnInit() {
    // Check if redirecting back from stripe with a session ID
    this.route.queryParams.subscribe((params) => {
      const sessionId = params['session_id'];
      const tier = params['tier'];
      // Back from Stripe Checkout without paying: the best moment to ask why
      if (params['canceled']) {
        this.toast.info(this.i18n.t('payment.canceled'));
        this.analytics.track('checkout_canceled');
        if (this.authService.isGMOrOfficer()) this.survey.set('payment_exit');
      }
      // Link of the end-of-trial Discord DM
      if (params['feedback'] === 'trial_end') this.survey.set('trial_end');

      if (sessionId) {
        this.verifyStripeSession(sessionId, tier);
      } else {
        // Standard flow: If user has no active guild set, redirect to select-guild
        if (!this.authService.currentUser()?.active_guild_id) {
          this.router.navigate(['/select-guild']);
        } else if (!this.viewTracked) {
          this.viewTracked = true;
          this.analytics.track('payment_viewed');
        }
      }
    });
  }

  verifyStripeSession(sessionId: string, tier?: string) {
    this.verifyingSession.set(true);
    this.verificationSuccess.set(null);

    const queryParams = tier ? `?tier=${tier}` : '';
    this.http
      .get<any>(`${this.apiUrl}/stripe/checkout-session/${sessionId}${queryParams}`, {
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.verificationSuccess.set(true);
          this.toast.success(this.i18n.t('payment.success'));

          // Refresh auth details to update the signal details and go to dashboard
          this.authService.checkAuth().subscribe({
            next: () => {
              setTimeout(() => {
                this.router.navigate(['/dashboard']);
                this.verifyingSession.set(false);
              }, 3000);
            },
            error: () => {
              setTimeout(() => {
                this.router.navigate(['/dashboard']);
                this.verifyingSession.set(false);
              }, 3000);
            },
          });
        },
        error: (err) => {
          console.error('Error verifying Stripe session', err);
          this.verificationSuccess.set(false);
          this.toast.error(this.i18n.t('payment.error'));
          // Even on error, hide verification box after 4 seconds so they can see alternative options
          setTimeout(() => {
            this.verifyingSession.set(false);
          }, 4000);
        },
      });
  }

  openSurvey() {
    this.survey.set('payment_exit');
  }

  async sendFeedback(answer: FeedbackAnswer) {
    const source = this.survey();
    if (!source || this.surveyBusy()) return;
    this.surveyBusy.set(true);
    this.analytics.sendFeedback(source, answer).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('feedback.thanks'));
        this.survey.set(null);
        this.surveyBusy.set(false);
      },
      error: () => {
        this.toast.error(this.i18n.t('feedback.error'));
        this.surveyBusy.set(false);
      },
    });
  }

  isSelectable(tier: PlanTier): boolean {
    return isPlanSelectable(tier, this.planContext());
  }

  selectTier(tier: PlanTier) {
    if (this.verifyingSession() || !this.isSelectable(tier)) return;
    this.selectedTier.set(tier);
  }

  price(cents: number): string {
    return formatPrice(cents, this.i18n.currentLocale());
  }

  date(iso: string): string {
    return formatBillingDate(iso, this.i18n.currentLocale());
  }

  async processPayment() {
    if (this.isProcessing() || !this.canSubmit()) return;
    this.isProcessing.set(true);
    const selected = this.selectedTier();
    this.hadSubscription = !!this.authService.currentUser()?.active_guild_has_subscription;
    const done =
      selected === 'free'
        ? await this.billing.activateFreeTrial()
        : await this.billing.choosePaidPlan(selected);
    // A paid choice without a running subscription leaves for Stripe: keep the spinner meanwhile
    const leaving = done && selected !== 'free' && !this.hadSubscription;
    if (done && !leaving) this.router.navigate(['/dashboard']);
    if (!leaving) this.isProcessing.set(false);
  }
}
