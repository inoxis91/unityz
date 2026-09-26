import { PlanTier } from '../../constants/plans';

const PLAN_KEY = 'guild_manager_pending_plan';
const TIERS: readonly PlanTier[] = ['free', 'medium', 'pro'];

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

/** Plan picked on the landing page, preselected on /payment after the Battle.net login. */
export function rememberPlan(tier: PlanTier, storage?: Storage) {
  try {
    (storage ?? sessionStorage).setItem(PLAN_KEY, tier);
  } catch {
    // Storage disabled: the payment page falls back to its default plan
  }
}

/** Reads and clears the remembered plan. */
export function takeRememberedPlan(storage?: Storage): PlanTier | null {
  try {
    // Reading `sessionStorage` itself throws when site data is blocked
    const store = storage ?? sessionStorage;
    const value = store.getItem(PLAN_KEY);
    store.removeItem(PLAN_KEY);
    return isPlanTier(value) ? value : null;
  } catch {
    return null;
  }
}

/** API error codes of the billing routes with a dedicated message (see backend billingService). */
const BILLING_ERRORS: Record<string, string> = {
  ACTIVE_SUBSCRIPTION: 'payment.error_active_sub',
  TRIAL_ALREADY_USED: 'payment.error_trial_used',
  PAYMENT_PAST_DUE: 'payment.error_past_due',
  PAYMENT_FAILED: 'payment.error_card',
  SAME_PLAN: 'payment.error_same_plan',
  NO_PENDING_INVOICE: 'payment.error_no_invoice',
};

/** i18n key for a failed billing call (`err` is an HttpErrorResponse-like object). */
export function billingErrorKey(err: unknown): string {
  const code = (err as { error?: { code?: string } } | null)?.error?.code;
  return (code && BILLING_ERRORS[code]) || 'payment.error';
}

/**
 * Confirmation text key for a prorated plan change: a charge now, a credit on the next invoices
 * (downgrade) or nothing to pay.
 */
export function prorationKey(amountCents: number): string {
  if (amountCents > 0) return 'payment.change_charge';
  if (amountCents < 0) return 'payment.change_credit';
  return 'payment.change_free';
}

/** How /payment handles the selected plan: trial activation, first Checkout or prorated change. */
export type PaymentMode = 'trial' | 'checkout' | 'change';

export function paymentMode(tier: PlanTier, subscribed: boolean): PaymentMode {
  if (tier === 'free') return 'trial';
  return subscribed ? 'change' : 'checkout';
}

/** Guild billing state that decides which plans /payment offers. */
export interface PlanContext {
  trialAvailable: boolean;
  /** A Stripe subscription is running: paid plans are switched with a prorated change. */
  subscribed: boolean;
  currentTier: PlanTier | null;
  /** Cancellation scheduled at period end: picking the current plan again undoes it. */
  canceled: boolean;
}

export function isPlanSelectable(tier: PlanTier, ctx: PlanContext): boolean {
  if (tier === 'free') return ctx.trialAvailable && !ctx.subscribed;
  return !ctx.subscribed || tier !== ctx.currentTier || ctx.canceled;
}

/**
 * Plan preselected on /payment: the remembered choice when it is selectable, otherwise the other
 * paid plan for a subscribed guild (its own one to undo a cancellation), the trial, or Pro.
 */
export function initialPlan(remembered: PlanTier | null, ctx: PlanContext): PlanTier {
  if (remembered && isPlanSelectable(remembered, ctx)) return remembered;
  if (ctx.subscribed && ctx.currentTier && ctx.currentTier !== 'free') {
    if (ctx.canceled) return ctx.currentTier;
    return ctx.currentTier === 'pro' ? 'medium' : 'pro';
  }
  return ctx.trialAvailable ? 'free' : 'pro';
}

/** Billing date shown on /payment (first charge, renewal). */
export function formatBillingDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
