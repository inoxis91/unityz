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
