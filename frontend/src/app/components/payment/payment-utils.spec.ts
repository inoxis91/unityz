import {
  billingErrorKey,
  isPlanTier,
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
});
