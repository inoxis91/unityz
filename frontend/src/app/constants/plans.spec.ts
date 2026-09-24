import { PLANS, formatPrice, planFeatures } from './plans';

describe('plans', () => {
  it('lists the three offers with the Stripe prices', () => {
    expect(PLANS.map((p) => [p.tier, p.priceCents])).toEqual([
      ['free', 0],
      ['medium', 299],
      ['pro', 499],
    ]);
  });

  it('derives quotas from the tier limits', () => {
    const free = planFeatures('free');
    expect(free).toContainEqual({ key: 'plans.feat.roster_one', status: 'limit', count: 1 });
    expect(free).toContainEqual({ key: 'plans.feat.events', status: 'limit', count: 3 });

    const medium = planFeatures('medium');
    expect(medium).toContainEqual({ key: 'plans.feat.rosters', status: 'limit', count: 2 });
    expect(medium).toContainEqual({ key: 'plans.feat.events', status: 'limit', count: 6 });

    const pro = planFeatures('pro');
    expect(pro).toContainEqual({ key: 'plans.feat.rosters_unlimited', status: 'yes' });
    expect(pro).toContainEqual({ key: 'plans.feat.events_unlimited', status: 'yes' });
  });

  it('reserves the Discord bot for Pro', () => {
    const discord = (tier: 'free' | 'medium' | 'pro') =>
      planFeatures(tier).find((f) => f.key === 'plans.feat.discord')?.status;
    expect([discord('free'), discord('medium'), discord('pro')]).toEqual(['no', 'no', 'yes']);
  });

  it('formats prices per locale', () => {
    expect(formatPrice(499, 'fr').replace(/\s/g, ' ')).toBe('4,99 €');
    expect(formatPrice(499, 'en')).toBe('€4.99');
    expect(formatPrice(0, 'fr').replace(/\s/g, ' ')).toBe('0 €');
  });
});
