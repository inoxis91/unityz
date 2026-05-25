import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeeService, FeeAllocation, FeeDeclaration } from '../../services/fee';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-fees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fees.html',
  styleUrl: './fees.css'
})
export class FeesComponent implements OnInit {
  currentYear = new Date().getFullYear();
  months = [
    { name: 'Janvier', index: 0 }, { name: 'Février', index: 1 }, { name: 'Mars', index: 2 },
    { name: 'Avril', index: 3 }, { name: 'Mai', index: 4 }, { name: 'Juin', index: 5 },
    { name: 'Juillet', index: 6 }, { name: 'Août', index: 7 }, { name: 'Septembre', index: 8 },
    { name: 'Octobre', index: 9 }, { name: 'Novembre', index: 10 }, { name: 'Décembre', index: 11 }
  ];

  // Form
  newDeclaration = {
    amount: 2000,
    start_month: this.getDefaultStartMonth(),
    duration_months: 1,
    comment: ''
  };

  constructor(public feeService: FeeService, public authService: AuthService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.feeService.loadMyDeclarations().subscribe();
    this.feeService.loadMyAllocations(this.currentYear).subscribe();
  }

  getDefaultStartMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  getMonthStatus(monthIndex: number) {
    const dateStr = `${this.currentYear}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const alloc = this.feeService.myAllocations().find(a => a.month_date.startsWith(dateStr.substring(0, 7)));
    
    if (!alloc) return { class: 'none', label: '0 PO', icon: '⭕' };
    if (alloc.amount >= 2000) {
      return { 
        class: alloc.amount > 2000 ? 'donation' : 'paid', 
        label: `${alloc.amount} PO`, 
        icon: alloc.amount > 2000 ? '⭐' : '✅' 
      };
    }
    return { class: 'partial', label: `${alloc.amount} PO`, icon: '⚠️' };
  }

  onSubmit() {
    // Convert YYYY-MM from input to YYYY-MM-01 for backend
    const submissionData = {
      ...this.newDeclaration,
      start_month: `${this.newDeclaration.start_month}-01`
    };

    this.feeService.declarePayment(submissionData).subscribe({
      next: () => {
        this.loadData();
        this.newDeclaration = {
          amount: 2000,
          start_month: this.getDefaultStartMonth(),
          duration_months: 1,
          comment: ''
        };
        alert('Déclaration envoyée avec succès ! Un administrateur va la valider prochainement.');
      },
      error: (err) => {
        console.error('Declaration error:', err);
        alert('Erreur lors de la déclaration.');
      }
    });
  }
}
