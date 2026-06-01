import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment.html',
  styleUrl: './payment.css'
})
export class PaymentComponent implements OnInit {
  public authService = inject(AuthService);
  public i18n = inject(I18nService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  isProcessing = signal(false);
  selectedTier = signal<'free' | 'medium' | 'pro'>('free');
  private apiUrl = environment.apiUrl;

  ngOnInit() {
    // If user has no active guild set, redirect to select-guild
    if (!this.authService.currentUser()?.active_guild_id) {
      this.router.navigate(['/select-guild']);
    }
  }

  selectTier(tier: 'free' | 'medium' | 'pro') {
    this.selectedTier.set(tier);
  }

  processPayment() {
    this.isProcessing.set(true);

    // Simulation d'une confirmation de paiement Stripe en appelant l'API backend
    this.http.post(`${this.apiUrl}/stripe/mock-payment-success`, { tier: this.selectedTier() }, { withCredentials: true }).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('payment.success'));
        
        // Refresh auth details to update the signal details and go to dashboard
        this.authService.checkAuth().subscribe({
          next: () => {
            this.router.navigate(['/dashboard']);
            this.isProcessing.set(false);
          },
          error: () => {
            this.router.navigate(['/dashboard']);
            this.isProcessing.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Error simulating payment', err);
        this.toast.error(this.i18n.t('payment.error'));
        this.isProcessing.set(false);
      }
    });
  }
}
