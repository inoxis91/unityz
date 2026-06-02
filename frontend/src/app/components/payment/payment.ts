import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
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
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  isProcessing = signal(false);
  verifyingSession = signal(false);
  verificationSuccess = signal<boolean | null>(null);
  selectedTier = signal<'free' | 'medium' | 'pro'>('free');
  private apiUrl = environment.apiUrl;

  ngOnInit() {
    // Check if redirecting back from stripe with a session ID
    this.route.queryParams.subscribe(params => {
      const sessionId = params['session_id'];
      const tier = params['tier'];

      if (sessionId) {
        this.verifyStripeSession(sessionId, tier);
      } else {
        // Standard flow: If user has no active guild set, redirect to select-guild
        if (!this.authService.currentUser()?.active_guild_id) {
          this.router.navigate(['/select-guild']);
        }
      }
    });
  }

  verifyStripeSession(sessionId: string, tier?: string) {
    this.verifyingSession.set(true);
    this.verificationSuccess.set(null);

    const queryParams = tier ? `?tier=${tier}` : '';
    this.http.get<any>(`${this.apiUrl}/stripe/checkout-session/${sessionId}${queryParams}`, { withCredentials: true }).subscribe({
      next: () => {
        this.verificationSuccess.set(true);
        this.toast.success(this.i18n.t('payment.success'));
        
        // Refresh auth details to update the signal details and go to dashboard
        this.authService.checkAuth().subscribe({
          next: () => {
            setTimeout(() => {
              this.router.navigate(['/dashboard']);
              this.verifyingSession.set(false);
            }, 3000);
          },
          error: () => {
            setTimeout(() => {
              this.router.navigate(['/dashboard']);
              this.verifyingSession.set(false);
            }, 3000);
          }
        });
      },
      error: (err) => {
        console.error('Error verifying Stripe session', err);
        this.verificationSuccess.set(false);
        this.toast.error(this.i18n.t('payment.error'));
        // Even on error, hide verification box after 4 seconds so they can see alternative options
        setTimeout(() => {
          this.verifyingSession.set(false);
        }, 4000);
      }
    });
  }

  selectTier(tier: 'free' | 'medium' | 'pro') {
    if (this.verifyingSession()) return;
    this.selectedTier.set(tier);
  }

  processPayment() {
    if (this.isProcessing()) return;
    this.isProcessing.set(true);

    const selected = this.selectedTier();

    if (selected === 'free') {
      // Free activation (trial)
      this.http.post(`${this.apiUrl}/stripe/mock-payment-success`, { tier: 'free' }, { withCredentials: true }).subscribe({
        next: () => {
          this.toast.success(this.i18n.t('payment.success'));
          
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
          console.error('Error activating free tier', err);
          this.toast.error(this.i18n.t('payment.error'));
          this.isProcessing.set(false);
        }
      });
    } else {
      // Paid subscription tier: initiate real Stripe Checkout session creation
      this.http.post<{ url: string }>(`${this.apiUrl}/stripe/create-checkout-session`, { tier: selected }, { withCredentials: true }).subscribe({
        next: (res) => {
          if (res && res.url) {
            // Redirect user to Stripe Checkout (or mock checkout handler URL)
            window.location.href = res.url;
          } else {
            throw new Error('No checkout URL received from server.');
          }
        },
        error: (err) => {
          console.error('Error creating Checkout Session', err);
          this.toast.error(this.i18n.t('payment.error'));
          this.isProcessing.set(false);
        }
      });
    }
  }
}
