import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CharacterManagerComponent } from '../character-manager/character-manager';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { environment } from '../../../environments/environment';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';

type OptionsTab = 'characters' | 'settings';

@Component({
  selector: 'app-options',
  imports: [DatePipe, FormsModule, RouterModule, CharacterManagerComponent, PageHeaderComponent],
  templateUrl: './options.html',
  styleUrl: './options.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsComponent implements OnInit {
  activeTab = signal<OptionsTab>('characters');
  isSetupMode = signal(false);

  public i18n = inject(I18nService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private confirmService = inject(ConfirmService);
  private apiUrl = environment.apiUrl;
  
  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');
  isProcessingSub = signal(false);

  readonly professionsList = [
    { id: 'alchemy', emoji: '⚗️' },
    { id: 'inscription', emoji: '📜' },
    { id: 'tailoring', emoji: '🧵' },
    { id: 'enchanting', emoji: '✨' },
    { id: 'blacksmithing', emoji: '⚒️' },
    { id: 'engineering', emoji: '⚙️' },
    { id: 'jewelcrafting', emoji: '💎' },
    { id: 'leatherworking', emoji: '🥾' },
  ];

  /** Valeurs éditables, réinitialisées quand le profil est rechargé. */
  readonly birthdayValue = linkedSignal(
    () => this.authService.currentUser()?.birthday?.substring(0, 10) ?? '',
  );
  readonly selectedProfessions = linkedSignal<string[]>(() => [
    ...(this.authService.currentUser()?.professions ?? []),
  ]);
  readonly savingBirthday = signal(false);
  readonly savingProfessions = signal(false);
  readonly unlinkingDiscord = signal(false);

  readonly professionsDirty = computed(() => {
    const saved = [...(this.authService.currentUser()?.professions ?? [])].sort();
    const current = [...this.selectedProfessions()].sort();
    return saved.join() !== current.join();
  });

  readonly birthdayDirty = computed(
    () => this.birthdayValue() !== (this.authService.currentUser()?.birthday?.substring(0, 10) ?? ''),
  );

  /** Progression de la période d'abonnement (offre gratuite de 30 jours). */
  readonly remainingDays = computed(() =>
    this.getRemainingDays(this.authService.currentUser()?.subscription_expires_at),
  );

  constructor(
    public authService: AuthService,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  selectTab(tab: OptionsTab) {
    this.activeTab.set(tab);
    // L'onglet reste dans l'URL (partage, retour arrière) sans empiler l'historique
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  saveBirthday() {
    const val = this.birthdayValue() || null;
    this.savingBirthday.set(true);
    this.authService.updateBirthday(val).subscribe({
      next: () => {
        this.savingBirthday.set(false);
        this.toast.success(this.i18n.t('options.birthday.toast_success'));
      },
      error: () => {
        this.savingBirthday.set(false);
        this.toast.error(this.i18n.t('options.birthday.toast_error'));
      }
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
    this.savingProfessions.set(true);
    this.authService.updateProfessions(this.selectedProfessions()).subscribe({
      next: () => {
        this.savingProfessions.set(false);
        this.toast.success(this.i18n.t('options.professions.toast_success'));
      },
      error: () => {
        this.savingProfessions.set(false);
        this.toast.error(this.i18n.t('options.professions.toast_error'));
      }
    });
  }

  async unlinkDiscord() {
    const ok = await this.confirmService.ask(
      this.i18n.t('options.discord.btn_unlink'),
      this.i18n.t('options.discord.confirm_unlink'),
      this.i18n.t('options.discord.btn_unlink'),
      this.i18n.t('calendar.form.btn_cancel'),
      true,
    );
    if (!ok) return;
    this.unlinkingDiscord.set(true);
    this.authService.updateDiscordId(null).subscribe({
      next: () => {
        this.unlinkingDiscord.set(false);
        this.toast.success(this.i18n.t('options.discord.toast_unlinked'));
      },
      error: () => {
        this.unlinkingDiscord.set(false);
        this.toast.error(this.i18n.t('options.birthday.toast_error'));
      },
    });
  }

  ngOnInit() {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      if (params['tab'] === 'settings') {
        this.activeTab.set('settings');
      } else {
        this.activeTab.set('characters');
      }
      if (params['setup'] === 'true' && !this.isSetupMode()) {
        this.isSetupMode.set(true);
        this.toast.info(this.i18n.t('options.toast.import_chars'));
      }
      // Retour de l'OAuth Discord : message affiché une fois, puis retiré de l'URL
      const flash = params['success'] === 'discord_linked' ? 'success' : params['error'] === 'discord_failed' ? 'error' : null;
      if (flash) {
        if (flash === 'success') this.toast.success(this.i18n.t('options.toast.discord_linked'));
        else this.toast.error(this.i18n.t('options.toast.discord_failed'));
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { success: null, error: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
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
      this.i18n.t('calendar.form.btn_cancel'),
      true,
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
