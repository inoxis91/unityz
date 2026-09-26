import {
  PlanContext,
  billingErrorKey,
  formatBillingDate,
  initialPlan,
  isPlanSelectable,
  isPlanTier,
  paymentMode,
  prorationKey,
  rememberPlan,
  takeRememberedPlan,
} from './payment-utils';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('payment-utils', () => {
  it('validates plan tiers', () => {
    expect(isPlanTier('pro')).toBe(true);
    expect(isPlanTier('none')).toBe(false);
    expect(isPlanTier(null)).toBe(false);
  });

  it('remembers a plan once', () => {
    const storage = memoryStorage();
    rememberPlan('medium', storage);
    expect(takeRememberedPlan(storage)).toBe('medium');
    expect(takeRememberedPlan(storage)).toBeNull();
  });

  it('ignores tampered values', () => {
    const storage = memoryStorage();
    storage.setItem('guild_manager_pending_plan', 'platinum');
    expect(takeRememberedPlan(storage)).toBeNull();
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => rememberPlan('pro', broken)).not.toThrow();
    expect(takeRememberedPlan(broken)).toBeNull();
  });

  it('maps billing error codes to messages', () => {
    expect(billingErrorKey({ error: { code: 'TRIAL_ALREADY_USED' } })).toBe(
      'payment.error_trial_used',
    );
    expect(billingErrorKey({ error: { code: 'PAYMENT_FAILED' } })).toBe('payment.error_card');
    expect(billingErrorKey({ error: { code: 'WHATEVER' } })).toBe('payment.error');
    expect(billingErrorKey(null)).toBe('payment.error');
  });

  it('describes a prorated change', () => {
    expect(prorationKey(137)).toBe('payment.change_charge');
    expect(prorationKey(-80)).toBe('payment.change_credit');
    expect(prorationKey(0)).toBe('payment.change_free');
  });

  const fresh: PlanContext = {
    trialAvailable: true,
    subscribed: false,
    currentTier: null,
    canceled: false,
  };
  const onMedium: PlanContext = {
    trialAvailable: false,
    subscribed: true,
    currentTier: 'medium',
    canceled: false,
  };

  it('picks the payment mode', () => {
    expect(paymentMode('free', false)).toBe('trial');
    expect(paymentMode('pro', false)).toBe('checkout');
    expect(paymentMode('pro', true)).toBe('change');
  });

  it('locks the current plan and the trial of a subscribed guild', () => {
    expect(isPlanSelectable('free', fresh)).toBe(true);
    expect(isPlanSelectable('free', { ...fresh, trialAvailable: false })).toBe(false);
    expect(isPlanSelectable('medium', onMedium)).toBe(false);
    expect(isPlanSelectable('pro', onMedium)).toBe(true);
    expect(isPlanSelectable('medium', { ...onMedium, canceled: true })).toBe(true);
  });

  it('preselects a selectable plan', () => {
    expect(initialPlan(null, fresh)).toBe('free');
    expect(initialPlan('medium', fresh)).toBe('medium');
    expect(initialPlan(null, { ...fresh, trialAvailable: false })).toBe('pro');
    expect(initialPlan(null, onMedium)).toBe('pro');
    expect(initialPlan('medium', onMedium)).toBe('pro');
    expect(initialPlan(null, { ...onMedium, currentTier: 'pro' })).toBe('medium');
    expect(initialPlan(null, { ...onMedium, canceled: true })).toBe('medium');
  });

  it('formats billing dates per locale', () => {
    expect(formatBillingDate('2026-10-26T16:07:18Z', 'fr')).toBe('26 octobre 2026');
    expect(formatBillingDate('2026-10-26T16:07:18Z', 'en')).toBe('26 October 2026');
  });
});
