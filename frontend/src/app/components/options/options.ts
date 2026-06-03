import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CharacterManagerComponent } from '../character-manager/character-manager';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-options',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CharacterManagerComponent],
  templateUrl: './options.html',
  styleUrl: './options.css'
})
export class OptionsComponent implements OnInit {
  activeTab = signal<'characters' | 'settings'>('characters');
  isSetupMode = signal(false);

  public i18n = inject(I18nService);
  private http = inject(HttpClient);
  private confirmService = inject(ConfirmService);
  private apiUrl = environment.apiUrl;
  
  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');
  isProcessingSub = signal(false);

  constructor(
    public authService: AuthService, 
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'settings') {
        this.activeTab.set('settings');
      }
      if (params['setup'] === 'true') {
        this.isSetupMode.set(true);
        this.toast.info(this.i18n.t('options.toast.import_chars'));
      }
      if (params['success'] === 'discord_linked') {
        this.toast.success(this.i18n.t('options.toast.discord_linked'));
      }
      if (params['error'] === 'discord_failed') {
        this.toast.error(this.i18n.t('options.toast.discord_failed'));
      }
    });
  }

  linkDiscord() {
    this.authService.linkDiscord();
  }

  getTierLabel(tier: string | undefined): string {
    switch (tier) {
      case 'free': return this.i18n.t('options.sub.tier_free');
      case 'medium': return this.i18n.t('options.sub.tier_medium');
      case 'pro': return this.i18n.t('options.sub.tier_pro');
      default: return this.i18n.t('options.sub.tier_none');
    }
  }

  getRemainingDays(expiresAt: string | null | undefined): number {
    if (!expiresAt) return 0;
    const diffTime = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  upgradeSubscription(tier: 'medium' | 'pro') {
    if (this.isProcessingSub()) return;
    this.isProcessingSub.set(true);

    this.http.post<{ url: string }>(`${this.apiUrl}/stripe/create-checkout-session`, { tier }, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res && res.url) {
          window.location.href = res.url;
        } else {
          this.toast.error(this.i18n.t('payment.error'));
          this.isProcessingSub.set(false);
        }
      },
      error: (err) => {
        console.error('Error upgrading subscription', err);
        this.toast.error(this.i18n.t('payment.error'));
        this.isProcessingSub.set(false);
      }
    });
  }

  cancelSubscription() {
    if (this.isProcessingSub()) return;

    this.confirmService.ask(
      this.i18n.t('options.sub.unsubscribe'),
      this.i18n.t('options.sub.confirm_unsubscribe'),
      this.i18n.t('options.sub.unsubscribe'),
      'Annuler'
    ).then((confirmed) => {
      if (!confirmed) return;

      this.isProcessingSub.set(true);
      this.http.post<any>(`${this.apiUrl}/stripe/cancel-subscription`, {}, { withCredentials: true }).subscribe({
        next: () => {
          this.toast.success(this.i18n.t('options.sub.unsubscribe_success'));
          this.authService.checkAuth().subscribe({
            next: () => this.isProcessingSub.set(false),
            error: () => this.isProcessingSub.set(false)
          });
        },
        error: (err) => {
          console.error('Error canceling subscription', err);
          this.toast.error(this.i18n.t('payment.error'));
          this.isProcessingSub.set(false);
        }
      });
    });
  }
}
