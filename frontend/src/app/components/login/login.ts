import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService, Guild } from '../../services/auth';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

export type LoginState = 'initial' | 'syncing' | 'guild-select' | 'subscribe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  
  loginState = signal<LoginState>('initial');
  guilds = signal<Guild[]>([]);
  selectedGuildForSubscription = signal<Guild | null>(null);
  
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  redirectUrl: string | null = null;

  plans = [
    { name: 'Starter', price: 'Gratuit', period: 'pour toujours', features: ["Jusqu'à 20 membres", "Roster basique"] },
    { name: 'Pro', price: '4.99€', period: '/ mois', features: ["Jusqu'à 100 membres", "Synchro Battle.net complète", "Calendrier avancé"] },
    { name: 'Mythic', price: '9.99€', period: '/ mois', features: ["Membres illimités", "Suivi Raider.IO intégré", "Tracker de présence (30j)"] }
  ];

  constructor(public authService: AuthService) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.redirectUrl = params['redirect'] || null;
      const isSyncing = params['sync'] === 'true';

      if (isSyncing) {
        this.loginState.set('syncing');
        this.performSync();
      } else {
        // Normal check
        this.authService.checkAuth().subscribe({
          next: (user) => {
            if (user.current_guild_id) {
              this.router.navigate([this.redirectUrl || '/dashboard']);
            } else {
              // Authenticated but no active guild selected, we should sync
              this.loginState.set('syncing');
              this.performSync();
            }
          },
          error: () => {} // Stay on initial
        });
      }
    });
  }

  login() {
    this.isLoading.set(true);
    this.authService.login(this.redirectUrl || undefined);
  }

  private performSync() {
    this.authService.syncGuilds().subscribe({
      next: (guilds) => {
        this.guilds.set(guilds);
        
        if (guilds.length === 0) {
          this.errorMessage.set("Vous n'appartenez à aucune guilde sur World of Warcraft.");
          this.loginState.set('initial');
        } else if (guilds.length === 1) {
          this.handleSingleGuild(guilds[0]);
        } else {
          this.loginState.set('guild-select');
        }
      },
      error: (err) => {
        console.error('Sync failed', err);
        this.errorMessage.set("Erreur lors de la synchronisation avec Battle.net.");
        this.loginState.set('initial');
      }
    });
  }

  private handleSingleGuild(guild: Guild) {
    if (guild.subscription_status === 'active') {
      this.activateGuild(guild.id);
    } else {
      if (guild.rank !== null && guild.rank <= 1) {
        this.selectedGuildForSubscription.set(guild);
        this.loginState.set('subscribe');
      } else {
        this.errorMessage.set(`La guilde ${guild.name} n'a pas d'abonnement actif. Demandez à votre GM d'en prendre un.`);
        this.loginState.set('initial');
      }
    }
  }

  selectGuild(guild: Guild) {
    if (guild.subscription_status === 'active') {
      this.activateGuild(guild.id);
    } else {
      if (guild.rank !== null && guild.rank <= 1) {
        this.selectedGuildForSubscription.set(guild);
        this.loginState.set('subscribe');
      } else {
        this.errorMessage.set(`L'abonnement pour ${guild.name} est inactif. Seul un GM ou Officier peut y souscrire.`);
      }
    }
  }

  private activateGuild(guildId: string) {
    this.isLoading.set(true);
    this.authService.setActiveGuild(guildId).subscribe({
      next: () => {
        // Fetch user again to update the signal and get the new current_guild_id
        this.authService.checkAuth().subscribe(() => {
           this.router.navigate([this.redirectUrl || '/dashboard']);
        });
      },
      error: (err) => {
        console.error('Failed to activate guild', err);
        this.errorMessage.set("Erreur lors de l'activation de la guilde.");
        this.isLoading.set(false);
      }
    });
  }

  subscribe(planName: string) {
    const guild = this.selectedGuildForSubscription();
    if (!guild) return;

    this.isLoading.set(true);
    this.authService.subscribeToGuild(guild.id).subscribe({
      next: () => {
        // Activate it immediately after subscribing
        this.activateGuild(guild.id);
      },
      error: (err) => {
        console.error('Subscription failed', err);
        this.errorMessage.set("Erreur lors de la souscription.");
        this.isLoading.set(false);
      }
    });
  }
}
