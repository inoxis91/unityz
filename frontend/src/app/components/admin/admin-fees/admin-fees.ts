import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeeDeclaration, FeeService, GuildFeeOverview } from '../../../services/fee';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { AuthService } from '../../../services/auth';
import { CharacterService } from '../../../services/character';
import { I18nService } from '../../../services/i18n';
import { MonthState, monthKey, monthState, monthlyShare } from '../../fees/fees-utils';

interface MemberChars {
  battletag?: string;
  main_character?: string;
  characters?: { name: string; realm: string; class: string; is_main: boolean }[];
}

type Modal =
  | { kind: 'reject'; decl: FeeDeclaration }
  | { kind: 'adjust'; user: GuildFeeOverview; month: number }
  | { kind: 'chars'; user: MemberChars }
  | null;

@Component({
  selector: 'app-admin-fees',
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-fees.html',
  styleUrl: './admin-fees.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeModal()' },
})
export class AdminFeesComponent {
  readonly i18n = inject(I18nService);
  readonly feeService = inject(FeeService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly monthIndexes = Array.from({ length: 12 }, (_, i) => i);
  readonly currentYear = new Date().getFullYear();
  readonly currentMonth = new Date().getMonth();

  readonly activeSubTab = signal<'pending' | 'guild'>('pending');
  readonly displayYear = signal(this.currentYear);
  readonly guildOverview = signal<GuildFeeOverview[]>([]);
  readonly overviewLoaded = signal(false);
  readonly search = signal('');
  readonly resolving = signal<ReadonlySet<string>>(new Set());
  readonly modal = signal<Modal>(null);
  readonly busy = signal(false);
  adminComment = '';
  adjustingAmount = 0;

  readonly minimumFee = computed(
    () => this.authService.currentUser()?.active_guild_minimum_fee_amount ?? 2000,
  );

  readonly pending = computed(() => {
    const hidden = this.resolving();
    return this.feeService.pendingDeclarations().filter((d) => !hidden.has(d.id));
  });

  readonly pendingTotal = computed(() => this.pending().reduce((sum, d) => sum + d.amount, 0));

  /** Grille membres × mois précalculée (évite de recalculer chaque cellule à chaque rendu). */
  readonly grid = computed(() => {
    const year = this.displayYear();
    const min = this.minimumFee();
    const q = this.search().trim().toLowerCase();
    return this.guildOverview()
      .filter(
        (u) =>
          !q ||
          u.battletag.toLowerCase().includes(q) ||
          (u.main_character ?? '').toLowerCase().includes(q),
      )
      .map((user) => {
        const byMonth = new Map<string, number>();
        for (const a of user.allocations ?? []) {
          if (!a?.month) continue;
          const key = a.month.slice(0, 7);
          byMonth.set(key, (byMonth.get(key) ?? 0) + Number(a.amount || 0));
        }
        const cells = this.monthIndexes.map((m) => {
          const amount = byMonth.get(monthKey(year, m)) ?? 0;
          return { month: m, amount, state: monthState(amount, min) as MonthState };
        });
        return {
          user,
          cells,
          total: cells.reduce((s, c) => s + c.amount, 0),
          paid: cells.filter((c) => c.state === 'paid' || c.state === 'donation').length,
        };
      });
  });

  readonly overviewStats = computed(() => {
    const rows = this.grid();
    const total = rows.reduce((s, r) => s + r.total, 0);
    const monthIdx = this.displayYear() === this.currentYear ? this.currentMonth : null;
    const upToDate =
      monthIdx === null
        ? null
        : rows.filter((r) => ['paid', 'donation'].includes(r.cells[monthIdx].state)).length;
    return { total, members: rows.length, upToDate };
  });

  constructor() {
    this.feeService.loadPendingDeclarations().subscribe();
    this.loadOverview();
  }

  loadOverview() {
    this.feeService.getGuildOverview(this.displayYear()).subscribe({
      next: (ov) => {
        this.guildOverview.set(ov);
        this.overviewLoaded.set(true);
      },
      error: () => this.overviewLoaded.set(true),
    });
  }

  changeYear(delta: number) {
    this.displayYear.update((y) => y + delta);
    this.loadOverview();
  }

  closeModal() {
    this.modal.set(null);
    this.busy.set(false);
  }

  private hide(id: string, hidden: boolean) {
    this.resolving.update((set) => {
      const next = new Set(set);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async onAccept(decl: FeeDeclaration) {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.fees.confirm_accept_title'),
      this.i18n
        .t('admin.fees.confirm_accept_msg')
        .replace('{amount}', decl.amount.toString())
        .replace('{member}', decl.battletag || ''),
    );
    if (!ok) return;

    // Retrait optimiste de la file, réaffiché si l'API refuse
    this.hide(decl.id, true);
    this.feeService.resolveDeclaration(decl.id, 'accepted').subscribe({
      next: () => {
        this.feeService.loadPendingDeclarations().subscribe();
        this.loadOverview();
        this.toast.success(this.i18n.t('admin.fees.toast_accept_success'));
      },
      error: () => {
        this.hide(decl.id, false);
        this.toast.error(this.i18n.t('admin.fees.toast_accept_error'));
      },
    });
  }

  openReject(decl: FeeDeclaration) {
    this.adminComment = '';
    this.modal.set({ kind: 'reject', decl });
  }

  onReject(decl: FeeDeclaration) {
    if (this.busy()) return;
    this.busy.set(true);
    this.hide(decl.id, true);
    this.feeService.resolveDeclaration(decl.id, 'rejected', this.adminComment.trim()).subscribe({
      next: () => {
        this.closeModal();
        this.feeService.loadPendingDeclarations().subscribe();
        this.toast.info(this.i18n.t('admin.fees.toast_reject_success'));
      },
      error: () => {
        this.busy.set(false);
        this.hide(decl.id, false);
        this.toast.error(this.i18n.t('admin.fees.toast_reject_error'));
      },
    });
  }

  openAdjust(user: GuildFeeOverview, month: number, amount: number) {
    this.adjustingAmount = amount;
    this.modal.set({ kind: 'adjust', user, month });
  }

  onSaveAdjustment(user: GuildFeeOverview, month: number) {
    if (this.busy()) return;
    this.busy.set(true);
    const monthDate = `${monthKey(this.displayYear(), month)}-01`;
    const amount = Math.max(0, Math.floor(Number(this.adjustingAmount) || 0));
    this.feeService.adjustAllocation(user.user_id, monthDate, amount).subscribe({
      next: () => {
        this.loadOverview();
        this.closeModal();
        this.toast.success(this.i18n.t('admin.fees.toast_adjust_success'));
      },
      error: () => {
        this.busy.set(false);
        this.toast.error(this.i18n.t('admin.fees.toast_adjust_error'));
      },
    });
  }

  openChars(user: MemberChars) {
    this.modal.set({ kind: 'chars', user });
  }

  perMonth(decl: FeeDeclaration): number {
    return monthlyShare(decl.amount, decl.duration_months);
  }

  shortAmount(amount: number): string {
    return amount >= 1000 ? `${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k` : String(amount);
  }

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }

  async onSendReminders() {
    const ok = await this.confirm.ask(
      this.i18n.t('admin.fees.confirm_remind_title'),
      this.i18n.t('admin.fees.confirm_remind_msg'),
    );
    if (!ok) return;

    this.feeService.sendPaymentReminders().subscribe({
      next: (res) => {
        if (res.messageSent) {
          this.toast.success(
            this.i18n
              .t('admin.fees.toast_remind_success')
              .replace('{count}', res.notifiedCount.toString()),
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
        console.error('[AdminFees] Reminder error', err);
        this.toast.error(this.i18n.t('admin.fees.toast_remind_error'));
      },
    });
  }
}
