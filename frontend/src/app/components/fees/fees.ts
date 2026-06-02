import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeeService, FeeAllocation, FeeDeclaration } from '../../services/fee';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-fees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fees.html',
  styleUrl: './fees.css'
})
export class FeesComponent implements OnInit {
  public i18n = inject(I18nService);

  displayYear = signal(new Date().getFullYear());
  months = computed(() => [
    { name: this.i18n.t('month.0'), index: 0 }, { name: this.i18n.t('month.1'), index: 1 }, { name: this.i18n.t('month.2'), index: 2 },
    { name: this.i18n.t('month.3'), index: 3 }, { name: this.i18n.t('month.4'), index: 4 }, { name: this.i18n.t('month.5'), index: 5 },
    { name: this.i18n.t('month.6'), index: 6 }, { name: this.i18n.t('month.7'), index: 7 }, { name: this.i18n.t('month.8'), index: 8 },
    { name: this.i18n.t('month.9'), index: 9 }, { name: this.i18n.t('month.10'), index: 10 }, { name: this.i18n.t('month.11'), index: 11 }
  ]);

  showForm = signal(false);
  selectedMonthName = '';
  discordId = '';

  minimumFee = computed(() => this.authService.currentUser()?.active_guild_minimum_fee_amount ?? 2000);
  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');

  // Form
  newDeclaration = {
    amount: 2000,
    start_month: '',
    duration_months: 1,
    comment: ''
  };

  constructor(
    public feeService: FeeService, 
    public authService: AuthService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadData();
    this.newDeclaration.amount = this.minimumFee();
  }

  loadData() {
    this.feeService.loadMyDeclarations().subscribe();
    this.feeService.loadMyAllocations(this.displayYear()).subscribe();
    this.discordId = this.authService.currentUser()?.discord_id || '';
  }

  saveDiscordId() {
    this.authService.updateDiscordId(this.discordId).subscribe({
      next: () => this.toast.success(this.i18n.t('fees.toast.discord_success')),
      error: () => this.toast.error(this.i18n.t('fees.toast.discord_error'))
    });
  }

  changeYear(delta: number) {
    const baseYear = new Date().getFullYear();
    const newYear = this.displayYear() + delta;
    
    // Limitation +/- 1 an comme demandé
    if (newYear < baseYear - 1 || newYear > baseYear + 1) return;
    
    this.displayYear.set(newYear);
    this.feeService.loadMyAllocations(newYear).subscribe();
  }

  linkDiscord() {
    this.authService.linkDiscord();
  }

  selectMonth(monthIndex: number) {
    const month = this.months()[monthIndex];
    this.selectedMonthName = `${month.name} ${this.displayYear()}`;
    
    // Set internal date for backend YYYY-MM-01
    this.newDeclaration.start_month = `${this.displayYear()}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    
    this.showForm.set(true);
    
    // Smooth scroll to form on mobile
    setTimeout(() => {
      document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  getMonthStatus(monthIndex: number) {
    const dateStr = `${this.displayYear()}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const alloc = this.feeService.myAllocations().find(a => a.month_date.startsWith(dateStr.substring(0, 7)));
    
    if (!alloc) return { class: 'none', label: '0 PO', icon: '⭕' };
    if (alloc.amount >= this.minimumFee()) {
      return { 
        class: alloc.amount > this.minimumFee() ? 'donation' : 'paid', 
        label: `${alloc.amount} PO`, 
        icon: alloc.amount > this.minimumFee() ? '⭐' : '✅' 
      };
    }
    return { class: 'partial', label: `${alloc.amount} PO`, icon: '⚠️' };
  }

  onSubmit() {
    this.feeService.declarePayment(this.newDeclaration).subscribe({
      next: () => {
        this.loadData();
        this.showForm.set(false);
        this.newDeclaration = {
          amount: this.minimumFee(),
          start_month: '',
          duration_months: 1,
          comment: ''
        };
        this.toast.success(this.i18n.t('fees.toast.decl_success'));
      },
      error: (err: any) => {
        console.error('Declaration error:', err);
        this.toast.error(this.i18n.t('fees.toast.decl_error'));
      }
    });
  }
}
