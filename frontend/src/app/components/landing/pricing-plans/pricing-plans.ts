import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { I18nService } from '../../../services/i18n';
import { PLANS, PlanTier, formatPrice, planFeatures } from '../../../constants/plans';

@Component({
  selector: 'app-pricing-plans',
  templateUrl: './pricing-plans.html',
  styleUrl: './pricing-plans.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPlansComponent {
  readonly i18n = inject(I18nService);
  readonly choose = output<PlanTier>();

  readonly plans = computed(() => {
    const locale = this.i18n.currentLocale();
    return PLANS.map((plan) => ({
      ...plan,
      price: formatPrice(plan.priceCents, locale),
      features: planFeatures(plan.tier).map((f) => ({
        ...f,
        label: this.i18n.tf(f.key, { n: f.count ?? '' }),
        statusLabel: this.i18n.t(`plans.status.${f.status}`),
      })),
    }));
  });
}
