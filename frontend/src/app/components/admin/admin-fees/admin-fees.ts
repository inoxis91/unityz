import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeeService, FeeDeclaration, GuildFeeOverview } from '../../../services/fee';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { AuthService } from '../../../services/auth';
import { I18nService } from '../../../services/i18n';

@Component({
  selector: 'app-admin-fees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-fees.html',
  styleUrl: './admin-fees.css'
})
export class AdminFeesComponent implements OnInit {
  activeSubTab = signal<'pending' | 'guild'>('pending');
  displayYear = signal(new Date().getFullYear());
  guildOverview = signal<GuildFeeOverview[]>([]);
  
  public i18n = inject(I18nService);
  
  // Rejection Modal
  showRejectModal = signal(false);
  resolvingDecl: FeeDeclaration | null = null;
  adminComment = '';

  // Adjustment Modal
  showAdjustModal = signal(false);
  adjustingUser: GuildFeeOverview | null = null;
  adjustingMonthIndex: number = 0;
  adjustingAmount: number = 0;

  public authService = inject(AuthService);
  minimumFee = computed(() => this.authService.currentUser()?.active_guild_minimum_fee_amount ?? 2000);

  // Character List Modal
  showCharactersModal = signal(false);
  modalUser: { battletag?: string; main_character?: string; characters?: any[] } | null = null;

  months = [
    { index: 1 }, { index: 2 }, { index: 3 },
    { index: 4 }, { index: 5 }, { index: 6 },
    { index: 7 }, { index: 8 }, { index: 9 },
    { index: 10 }, { index: 11 }, { index: 12 }
  ];

  constructor(
    public feeService: FeeService,
    private toast: ToastService,
    private confirm: ConfirmService
  ) {}

  ngOnInit() {
    this.loadPending();
    this.loadOverview();
  }

  loadPending() {
    this.feeService.loadPendingDeclarations().subscribe();
  }

  loadOverview() {
    this.feeService.getGuildOverview(this.displayYear()).subscribe(ov => this.guildOverview.set(ov));
  }

  changeYear(delta: number) {
    this.displayYear.update(y => y + delta);
    this.loadOverview();
  }

  async onAccept(decl: FeeDeclaration) {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.fees.confirm_accept_title'), 
      this.i18n.t('admin.fees.confirm_accept_msg')
        .replace('{amount}', decl.amount.toString())
        .replace('{member}', decl.battletag || '')
    );

    if (ok) {
      this.feeService.resolveDeclaration(decl.id, 'accepted').subscribe({
        next: () => {
          this.loadPending();
          this.loadOverview();
          this.toast.success(this.i18n.t('admin.fees.toast_accept_success'));
        },
        error: () => this.toast.error(this.i18n.t('admin.fees.toast_accept_error'))
      });
    }
  }

  openRejectModal(decl: FeeDeclaration) {
    this.resolvingDecl = decl;
    this.adminComment = '';
    this.showRejectModal.set(true);
  }

  closeRejectModal() {
    this.showRejectModal.set(false);
    this.resolvingDecl = null;
  }

  onReject() {
    if (!this.resolvingDecl) return;
    this.feeService.resolveDeclaration(this.resolvingDecl.id, 'rejected', this.adminComment).subscribe({
      next: () => {
        this.loadPending();
        this.closeRejectModal();
        this.toast.info(this.i18n.t('admin.fees.toast_reject_success'));
      },
      error: () => this.toast.error(this.i18n.t('admin.fees.toast_reject_error'))
    });
  }

  openAdjustModal(user: GuildFeeOverview, monthIndex: number) {
    this.adjustingUser = user;
    this.adjustingMonthIndex = monthIndex;
    const allocations = user.allocations || [];
    const currentAlloc = allocations.find(a => a?.month?.startsWith(`${this.displayYear()}-${String(monthIndex).padStart(2, '0')}`));
    this.adjustingAmount = currentAlloc ? currentAlloc.amount : 0;
    this.showAdjustModal.set(true);
  }

  onSaveAdjustment() {
    if (!this.adjustingUser) return;
    const monthDate = `${this.displayYear()}-${String(this.adjustingMonthIndex).padStart(2, '0')}-01`;
    this.feeService.adjustAllocation(this.adjustingUser.user_id, monthDate, this.adjustingAmount).subscribe({
      next: () => {
        this.loadOverview();
        this.showAdjustModal.set(false);
        this.toast.success(this.i18n.t('admin.fees.toast_adjust_success'));
      },
      error: () => this.toast.error(this.i18n.t('admin.fees.toast_adjust_error'))
    });
  }

  openCharactersModal(user: any) {
    this.modalUser = user;
    this.showCharactersModal.set(true);
  }

  closeCharactersModal() {
    this.showCharactersModal.set(false);
    this.modalUser = null;
  }

  getMonthAlloc(user: GuildFeeOverview, monthIndex: number) {
    const dateStr = `${this.displayYear()}-${String(monthIndex).padStart(2, '0')}-01`;
    const allocations = user.allocations || [];
    return allocations.find(a => a?.month?.startsWith(dateStr.substring(0, 7)));
  }

  getUserMonthStatus(user: GuildFeeOverview, monthIndex: number) {
    const alloc = this.getMonthAlloc(user, monthIndex);
    if (!alloc || alloc.amount === 0) return { class: 'none', icon: '⭕', amount: 0 };
    if (alloc.amount >= this.minimumFee()) return { class: alloc.amount > this.minimumFee() ? 'donation' : 'paid', icon: alloc.amount > this.minimumFee() ? '⭐' : '✅', amount: alloc.amount };
    return { class: 'partial', icon: '⚠️', amount: alloc.amount };
  }

  async onSendReminders() {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.fees.confirm_remind_title'),
      this.i18n.t('admin.fees.confirm_remind_msg')
    );

    if (ok) {
      this.feeService.sendPaymentReminders().subscribe({
        next: (res) => {
          if (res.messageSent) {
            this.toast.success(
              this.i18n.t('admin.fees.toast_remind_success')
                .replace('{count}', res.notifiedCount.toString())
            );
          } else if (res.error === 'DISCORD_DISABLED') {
            this.toast.error(this.i18n.t('admin.fees.toast_remind_disabled'));
          } else if (res.error === 'CHANNEL_NOT_CONFIGURED') {
            this.toast.error(this.i18n.t('admin.fees.toast_remind_no_channel'));
          } else if (res.error === 'DISCORD_SEND_FAILED') {
            this.toast.error(this.i18n.t('admin.fees.toast_remind_send_failed'));
          } else if (res.lateCount === 0) {
            this.toast.info(this.i18n.t('admin.fees.toast_remind_none_late'));
          } else {
            this.toast.info(this.i18n.t('admin.fees.toast_remind_info'));
          }
        },
        error: (err) => {
          console.error(err);
          this.toast.error(this.i18n.t('admin.fees.toast_remind_error'));
        }
      });
    }
  }
}
