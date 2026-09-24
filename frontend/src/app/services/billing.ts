import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { ConfirmService } from './confirm';
import { I18nService } from './i18n';
import { ToastService } from './toast';
import { formatPrice } from '../constants/plans';
import { billingErrorKey, prorationKey, rememberPlan } from '../components/payment/payment-utils';

export type PaidTier = 'medium' | 'pro';

interface PlanChangePreview {
  amount: number;
  currency: string;
  periodEnd: string;
}

/**
 * Guild subscription actions shared by /payment and the options page. Every method reports its
 * own errors with a toast and resolves to whether the action went through.
 */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly api = `${environment.apiUrl}/stripe`;
  private readonly options = { withCredentials: true };

  /**
   * Paid plan: a prorated change of the running subscription, or a Stripe Checkout redirect for a
   * first subscription.
   */
  async choosePaidPlan(tier: PaidTier): Promise<boolean> {
    return this.auth.currentUser()?.active_guild_has_subscription
      ? this.changePlan(tier)
      : this.checkout(tier);
  }

  async checkout(tier: PaidTier): Promise<boolean> {
    try {
      const { url } = await firstValueFrom(
        this.http.post<{ url: string }>(
          `${this.api}/create-checkout-session`,
          { tier },
          this.options,
        ),
      );
      // Preselected again if the user comes back from Stripe without paying
      rememberPlan(tier);
      window.location.href = url;
      return true;
    } catch (err) {
      return this.fail(err);
    }
  }

  async activateFreeTrial(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post(`${this.api}/activate-free`, {}, this.options));
      this.toast.success(this.i18n.t('payment.trial_success'));
      await this.refreshUser();
      return true;
    } catch (err) {
      return this.fail(err);
    }
  }

  /** Shows the prorated amount, asks for confirmation, then switches plan. */
  async changePlan(tier: PaidTier): Promise<boolean> {
    let preview: PlanChangePreview;
    try {
      preview = await firstValueFrom(
        this.http.post<PlanChangePreview>(
          `${this.api}/change-plan/preview`,
          { tier },
          this.options,
        ),
      );
    } catch (err) {
      return this.fail(err);
    }

    const plan = this.i18n.t('plans.name.' + tier);
    const message = this.i18n.tf(prorationKey(preview.amount), {
      plan,
      amount: formatPrice(Math.abs(preview.amount), this.i18n.currentLocale()),
    });
    const confirmed = await this.confirm.ask(
      this.i18n.tf('payment.change_title', { plan }),
      message,
      this.i18n.tf('payment.change_confirm', { plan }),
    );
    if (!confirmed) return false;

    try {
      await firstValueFrom(this.http.post(`${this.api}/change-plan`, { tier }, this.options));
      this.toast.success(this.i18n.tf('payment.change_success', { plan }));
      await this.refreshUser();
      return true;
    } catch (err) {
      return this.fail(err);
    }
  }

  /** Opens Stripe's hosted page of the unpaid invoice (pay it or change the card). */
  async payPendingInvoice(): Promise<boolean> {
    try {
      const { url } = await firstValueFrom(
        this.http.get<{ url: string }>(`${this.api}/pending-invoice`, this.options),
      );
      window.location.href = url;
      return true;
    } catch (err) {
      return this.fail(err);
    }
  }

  private async refreshUser() {
    await firstValueFrom(this.auth.checkAuth()).catch(() => undefined);
  }

  private fail(err: unknown): false {
    console.error('[Billing] Request failed', err);
    this.toast.error(this.i18n.t(billingErrorKey(err)));
    return false;
  }
}
