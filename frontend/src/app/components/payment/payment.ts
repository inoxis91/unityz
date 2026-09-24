import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { environment } from '../../../environments/environment';
import { PLANS, PlanTier, formatPrice, planFeatures } from '../../constants/plans';
import { takeRememberedPlan } from './payment-utils';
import { BillingService } from '../../services/billing';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, RouterModule],
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

  isProcessing = signal(false);
  verifyingSession = signal(false);
  verificationSuccess = signal<boolean | null>(null);
  /** The one-time trial is greyed out once the guild has used it. */
  readonly trialAvailable = computed(
    () => this.authService.currentUser()?.active_guild_free_trial_available !== false,
  );
  selectedTier = signal<PlanTier>(this.initialTier(takeRememberedPlan()));
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
  readonly confirmText = computed(() =>
    this.i18n.tf('payment.confirm_plan', {
      plan: this.i18n.t('plans.name.' + this.selectedTier()),
    }),
  );
  readonly canSubmit = computed(() => this.selectedTier() !== 'free' || this.trialAvailable());
  readonly verificationState = computed(() => {
    const ok = this.verificationSuccess();
    return ok === null ? 'pending' : ok ? 'success' : 'error';
  });

  ngOnInit() {
    // Check if redirecting back from stripe with a session ID
    this.route.queryParams.subscribe((params) => {
      const sessionId = params['session_id'];
      const tier = params['tier'];
      // Back from Stripe Checkout without paying
      if (params['canceled']) this.toast.info(this.i18n.t('payment.canceled'));

      if (sessionId) {
        this.verifyStripeSession(sessionId, tier);
      } else {
        // Standard flow: If user has no active guild set, redirect to select-guild
        if (!this.authService.currentUser()?.active_guild_id) {
          this.router.navigate(['/select-guild']);
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

  selectTier(tier: PlanTier) {
    if (this.verifyingSession() || (tier === 'free' && !this.trialAvailable())) return;
    this.selectedTier.set(tier);
  }

  private initialTier(remembered: PlanTier | null): PlanTier {
    const trial = this.authService.currentUser()?.active_guild_free_trial_available !== false;
    const tier = remembered ?? (trial ? 'free' : 'pro');
    return tier === 'free' && !trial ? 'pro' : tier;
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
