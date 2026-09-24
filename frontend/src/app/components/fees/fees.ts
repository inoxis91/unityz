import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FeeService } from '../../services/fee';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { I18nService } from '../../services/i18n';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import { CountUpDirective } from '../../shared/wcl/count-up';
import { buildYear, coveredMonths, monthKey, monthlyShare } from './fees-utils';

const DURATIONS = [1, 3, 6, 12] as const;

@Component({
  selector: 'app-fees',
  imports: [DatePipe, FormsModule, RouterModule, PageHeaderComponent, CountUpDirective],
  templateUrl: './fees.html',
  styleUrl: './fees.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeesComponent {
  readonly i18n = inject(I18nService);
  readonly feeService = inject(FeeService);
  readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly durations = DURATIONS;
  private readonly now = new Date();
  readonly currentKey = monthKey(this.now.getFullYear(), this.now.getMonth());

  readonly displayYear = signal(this.now.getFullYear());
  readonly minYear = this.now.getFullYear() - 1;
  readonly maxYear = this.now.getFullYear() + 1;

  readonly minimumFee = computed(
    () => this.authService.currentUser()?.active_guild_minimum_fee_amount ?? 2000,
  );
  readonly isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');
  readonly needsDiscord = computed(
    () => this.isPro() && !this.authService.currentUser()?.discord_id,
  );

  // ---------- Formulaire ----------
  readonly startMonth = signal(`${this.currentKey}-01`);
  readonly duration = signal<number>(1);
  readonly amount = signal(0);
  readonly comment = signal('');
  readonly submitting = signal(false);
  /** Le montant suit « minimum × durée » tant que l'utilisateur ne l'a pas saisi lui-même. */
  private readonly amountTouched = signal(false);

  readonly effectiveAmount = computed(() =>
    this.amountTouched() ? this.amount() : this.minimumFee() * this.duration(),
  );
  readonly perMonth = computed(() => monthlyShare(this.effectiveAmount(), this.duration()));
  readonly belowMinimum = computed(() => this.perMonth() < this.minimumFee());
  readonly covered = computed(() => new Set(coveredMonths(this.startMonth(), this.duration())));

  readonly startLabel = computed(() => {
    const [y, m] = this.startMonth().split('-').map(Number);
    return `${this.i18n.t('month.' + (m - 1))} ${y}`;
  });

  // ---------- Grille ----------
  readonly months = computed(() =>
    buildYear(this.feeService.myAllocations(), this.displayYear(), this.minimumFee()).map(
      (cell) => ({ ...cell, name: this.i18n.t('month.' + cell.index) }),
    ),
  );

  readonly stats = computed(() => {
    const cells = this.months();
    const declarations = this.feeService.myDeclarations();
    return {
      total: cells.reduce((sum, c) => sum + c.amount, 0),
      covered: cells.filter((c) => c.state === 'paid' || c.state === 'donation').length,
      pending: declarations.filter((d) => d.status === 'pending').length,
    };
  });

  constructor() {
    this.feeService.loadMyDeclarations().subscribe();
    this.loadYear();
  }

  private loadYear() {
    this.feeService.loadMyAllocations(this.displayYear()).subscribe();
  }

  changeYear(delta: number) {
    const year = this.displayYear() + delta;
    if (year < this.minYear || year > this.maxYear) return;
    this.displayYear.set(year);
    this.loadYear();
  }

  selectMonth(index: number) {
    this.startMonth.set(`${monthKey(this.displayYear(), index)}-01`);
    // Sur mobile le formulaire est sous la grille : on l'amène à l'écran
    if (window.matchMedia('(max-width: 1100px)').matches) {
      document.getElementById('fee-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  setDuration(duration: number) {
    this.duration.set(duration);
  }

  onAmountInput(value: number | null) {
    this.amountTouched.set(true);
    this.amount.set(Math.max(0, Math.floor(Number(value) || 0)));
  }

  resetAmount() {
    this.amountTouched.set(false);
  }

  linkDiscord() {
    this.authService.linkDiscord();
  }

  onSubmit() {
    const amount = this.effectiveAmount();
    if (this.submitting() || amount < 1) return;
    this.submitting.set(true);
    this.feeService
      .declarePayment({
        amount,
        start_month: this.startMonth(),
        duration_months: this.duration(),
        comment: this.comment().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.comment.set('');
          this.resetAmount();
          this.feeService.loadMyDeclarations().subscribe();
          this.toast.success(this.i18n.t('fees.toast.decl_success'));
        },
        error: (err) => {
          this.submitting.set(false);
          console.error('[Fees] Declaration error', err);
          this.toast.error(err?.error?.message || this.i18n.t('fees.toast.decl_error'));
        },
      });
  }

  statusLabel(status: string): string {
    if (status === 'pending') return this.i18n.t('fees.status.pending');
    if (status === 'rejected') return this.i18n.t('fees.status.rejected');
    return this.i18n.t('fees.status.approved');
  }
}
