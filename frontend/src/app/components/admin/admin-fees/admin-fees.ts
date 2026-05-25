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
  currentYear = new Date().getFullYear();
  guildOverview = signal<GuildFeeOverview[]>([]);
  
  // Rejection Modal
  showRejectModal = signal(false);
  resolvingDecl: FeeDeclaration | null = null;
  adminComment = '';

  months = [
    { name: 'Jan', index: 1 }, { name: 'Fév', index: 2 }, { name: 'Mar', index: 3 },
    { name: 'Avr', index: 4 }, { name: 'Mai', index: 5 }, { name: 'Jui', index: 6 },
    { name: 'Jul', index: 7 }, { name: 'Aoû', index: 8 }, { name: 'Sep', index: 9 },
    { name: 'Oct', index: 10 }, { name: 'Nov', index: 11 }, { name: 'Déc', index: 12 }
  ];

  constructor(public feeService: FeeService) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.feeService.loadPendingDeclarations().subscribe();
    this.feeService.getGuildOverview(this.currentYear).subscribe(ov => this.guildOverview.set(ov));
  }

  onAccept(decl: FeeDeclaration) {
    if (confirm(`Accepter le dépôt de ${decl.amount} PO de ${decl.battletag} ?`)) {
      this.feeService.resolveDeclaration(decl.id, 'accepted').subscribe(() => this.loadAll());
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
      this.loadAll();
      this.closeRejectModal();
    });
  }

  getUserMonthStatus(user: GuildFeeOverview, monthIndex: number) {
    const dateStr = `${this.currentYear}-${String(monthIndex).padStart(2, '0')}-01`;
    const alloc = user.allocations.find(a => a.month?.startsWith(dateStr.substring(0, 7)));
    
    if (!alloc || alloc.amount === 0) return { class: 'none', icon: '⭕' };
    if (alloc.amount >= 2000) return { class: alloc.amount > 2000 ? 'donation' : 'paid', icon: alloc.amount > 2000 ? '⭐' : '✅' };
    return { class: 'partial', icon: '⚠️' };
  }
}
