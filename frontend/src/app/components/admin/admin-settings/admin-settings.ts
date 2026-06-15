import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';
import { AuthService } from '../../../services/auth';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.css'
})
export class AdminSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  public i18n = inject(I18nService);
  public authService = inject(AuthService);
  private apiUrl = environment.apiUrl;

  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');

  discordEnabled = signal(false);
  discordGuildId = signal('');
  discordEventsChannelId = signal('');
  discordOfficerChannelId = signal('');
  discordCraftsChannelId = signal('');
  discordFeesChannelId = signal('');
  discordReminderChannelId = signal('');
  discordLocale = signal<'en' | 'fr'>('en');
  discordClientId = signal('');
  
  feesEnabled = signal(true);
  minimumFeeAmount = signal(2000);
  
  isLoading = signal(true);
  isSaving = signal(false);

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.isLoading.set(true);
    this.http.get<any>(`${this.apiUrl}/guilds/my-settings`, { withCredentials: true }).subscribe({
      next: (data) => {
        this.discordEnabled.set(data.discord_enabled || false);
        this.discordGuildId.set(data.discord_guild_id || '');
        this.discordEventsChannelId.set(data.discord_events_channel_id || '');
        this.discordOfficerChannelId.set(data.discord_officer_channel_id || '');
        this.discordCraftsChannelId.set(data.discord_crafts_channel_id || '');
        this.discordFeesChannelId.set(data.discord_fees_channel_id || '');
        this.discordReminderChannelId.set(data.discord_reminder_channel_id || '');
        this.discordLocale.set(data.discord_locale || 'en');
        this.discordClientId.set(data.discord_client_id || '');
        this.feesEnabled.set(data.fees_enabled !== undefined ? data.fees_enabled : true);
        this.minimumFeeAmount.set(data.minimum_fee_amount || 2000);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching guild settings', err);
        this.toast.error(this.i18n.t('admin.settings.toast.load_error'));
        this.isLoading.set(false);
      }
    });
  }

  saveSettings() {
    this.isSaving.set(true);
    const body = {
      discordEnabled: this.discordEnabled(),
      discordGuildId: this.discordGuildId() || null,
      discordEventsChannelId: this.discordEventsChannelId() || null,
      discordOfficerChannelId: this.discordOfficerChannelId() || null,
      discordCraftsChannelId: this.discordCraftsChannelId() || null,
      discordFeesChannelId: this.discordFeesChannelId() || null,
      discordReminderChannelId: this.discordReminderChannelId() || null,
      feesEnabled: this.feesEnabled(),
      minimumFeeAmount: this.minimumFeeAmount(),
      discordLocale: this.discordLocale()
    };

    this.http.put<any>(`${this.apiUrl}/guilds/my-settings`, body, { withCredentials: true }).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('admin.settings.toast.save_success'));
        // Refresh auth state to update currentUser fees details
        this.authService.checkAuth().subscribe();
        this.isSaving.set(false);
      },
      error: (err) => {
        console.error('Error saving guild settings', err);
        this.toast.error(this.i18n.t('admin.settings.toast.save_error'));
        this.isSaving.set(false);
      }
    });
  }
}
