import { Component, OnInit, signal, computed, effect, inject } from '@angular/core';
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

  birthdayValue = signal<string>('');

  professionsList = [
    { id: 'blacksmithing' },
    { id: 'leatherworking' },
    { id: 'tailoring' },
    { id: 'alchemy' },
    { id: 'jewelcrafting' },
    { id: 'engineering' },
    { id: 'inscription' },
    { id: 'enchanting' },
    { id: 'herbalism' },
    { id: 'mining' },
    { id: 'skinning' }
  ];

  selectedProfessions = signal<string[]>([]);

  constructor(
    public authService: AuthService, 
    private route: ActivatedRoute,
    private toast: ToastService
  ) {
    effect(() => {
      const bday = this.authService.currentUser()?.birthday;
      if (bday) {
        this.birthdayValue.set(bday.substring(0, 10));
      } else {
        this.birthdayValue.set('');
      }
    });

    effect(() => {
      const userProfs = this.authService.currentUser()?.professions || [];
      this.selectedProfessions.set([...userProfs]);
    });
  }

  saveBirthday() {
    const val = this.birthdayValue() ? this.birthdayValue() : null;
    this.authService.updateBirthday(val).subscribe({
      next: () => this.toast.success(this.i18n.t('options.birthday.toast_success')),
      error: () => this.toast.error(this.i18n.t('options.birthday.toast_error'))
    });
  }

  hasProfession(profId: string): boolean {
    return this.selectedProfessions().includes(profId);
  }

  toggleProfession(profId: string) {
    const current = this.selectedProfessions();
    if (current.includes(profId)) {
      this.selectedProfessions.set(current.filter(p => p !== profId));
    } else {
      this.selectedProfessions.set([...current, profId]);
    }
  }

  saveProfessions() {
    this.authService.updateProfessions(this.selectedProfessions()).subscribe({
      next: () => this.toast.success(this.i18n.t('options.professions.toast_success')),
      error: () => this.toast.error(this.i18n.t('options.professions.toast_error'))
    });
  }

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

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(this.i18n.currentLocale() === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
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

    const user = this.authService.currentUser();
    const expiryDate = user?.subscription_expires_at ? this.formatDate(user.subscription_expires_at) : '';
    
    const message = expiryDate 
      ? this.i18n.t('options.sub.confirm_unsubscribe_period_end').replace('{date}', expiryDate)
      : this.i18n.t('options.sub.confirm_unsubscribe');

    this.confirmService.ask(
      this.i18n.t('options.sub.unsubscribe'),
      message,
      this.i18n.t('options.sub.unsubscribe'),
      'Annuler'
    ).then((confirmed) => {
      if (!confirmed) return;

      this.isProcessingSub.set(true);
      this.http.post<any>(`${this.apiUrl}/stripe/cancel-subscription`, {}, { withCredentials: true }).subscribe({
        next: () => {
          const successMsg = expiryDate
            ? this.i18n.t('options.sub.unsubscribe_success_period_end').replace('{date}', expiryDate)
            : this.i18n.t('options.sub.unsubscribe_success');

          this.toast.success(successMsg);
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
