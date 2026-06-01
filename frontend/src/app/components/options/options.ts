import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CharacterManagerComponent } from '../character-manager/character-manager';
import { ToastService } from '../../services/toast';

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
  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');

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
        this.toast.info('Veuillez importer vos personnages Battle.net pour accéder au reste du site.');
      }
      if (params['success'] === 'discord_linked') {
        this.toast.success('Compte Discord lié avec succès !');
      }
      if (params['error'] === 'discord_failed') {
        this.toast.error('Échec de la liaison Discord.');
      }
    });
  }

  linkDiscord() {
    this.authService.linkDiscord();
  }

  getTierLabel(tier: string | undefined): string {
    switch (tier) {
      case 'free': return 'Essai Gratuit';
      case 'medium': return 'Moyen (Standard)';
      case 'pro': return 'Pro (Illimité)';
      default: return 'Aucun';
    }
  }
}
