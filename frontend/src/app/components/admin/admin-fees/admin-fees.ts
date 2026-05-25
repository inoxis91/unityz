import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeeService, FeeDeclaration, GuildFeeOverview } from '../../../services/fee';

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
  
  // Rejection Modal
  showRejectModal = signal(false);
  resolvingDecl: FeeDeclaration | null = null;
  adminComment = '';

  // Adjustment Modal
  showAdjustModal = signal(false);
  adjustingUser: GuildFeeOverview | null = null;
  adjustingMonthIndex: number = 0;
  adjustingAmount: number = 0;

  months = [
    { name: 'Jan', index: 1 }, { name: 'Fév', index: 2 }, { name: 'Mar', index: 3 },
    { name: 'Avr', index: 4 }, { name: 'Mai', index: 5 }, { name: 'Jui', index: 6 },
    { name: 'Jul', index: 7 }, { name: 'Aoû', index: 8 }, { name: 'Sep', index: 9 },
    { name: 'Oct', index: 10 }, { name: 'Nov', index: 11 }, { name: 'Déc', index: 12 }
  ];

  constructor(public feeService: FeeService) {}

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

  onAccept(decl: FeeDeclaration) {
    if (confirm(`Accepter le dépôt de ${decl.amount} PO de ${decl.battletag} ?`)) {
      this.feeService.resolveDeclaration(decl.id, 'accepted').subscribe(() => {
        this.loadPending();
        this.loadOverview();
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
    this.feeService.resolveDeclaration(this.resolvingDecl.id, 'rejected', this.adminComment).subscribe(() => {
      this.loadPending();
      this.closeRejectModal();
    });
  }

  openAdjustModal(user: GuildFeeOverview, monthIndex: number) {
    this.adjustingUser = user;
    this.adjustingMonthIndex = monthIndex;
    const currentAlloc = user.allocations.find(a => a.month?.startsWith(`${this.displayYear()}-${String(monthIndex).padStart(2, '0')}`));
    this.adjustingAmount = currentAlloc ? currentAlloc.amount : 0;
    this.showAdjustModal.set(true);
  }

  onSaveAdjustment() {
    if (!this.adjustingUser) return;
    const monthDate = `${this.displayYear()}-${String(this.adjustingMonthIndex).padStart(2, '0')}-01`;
    this.feeService.adjustAllocation(this.adjustingUser.user_id, monthDate, this.adjustingAmount).subscribe(() => {
      this.loadOverview();
      this.showAdjustModal.set(false);
    });
  }

  getMonthAlloc(user: GuildFeeOverview, monthIndex: number) {
    const dateStr = `${this.displayYear()}-${String(monthIndex).padStart(2, '0')}-01`;
    return user.allocations.find(a => a.month?.startsWith(dateStr.substring(0, 7)));
  }

  getUserMonthStatus(user: GuildFeeOverview, monthIndex: number) {
    const alloc = this.getMonthAlloc(user, monthIndex);
    if (!alloc || alloc.amount === 0) return { class: 'none', icon: '⭕', amount: 0 };
    if (alloc.amount >= 2000) return { class: alloc.amount > 2000 ? 'donation' : 'paid', icon: alloc.amount > 2000 ? '⭐' : '✅', amount: alloc.amount };
    return { class: 'partial', icon: '⚠️', amount: alloc.amount };
  }
}
