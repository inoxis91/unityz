import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { SeoService } from '../../services/seo';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public i18n = inject(I18nService);
  isLoading = signal(false);
  redirectUrl: string | null = null;
  
  isProd = environment.production;
  mockUsers = signal<any[]>([]);
  selectedMockUser = signal<string>('');
  private seo = inject(SeoService);

  constructor(public authService: AuthService) {
    effect(() => {
      const isFr = this.i18n.currentLocale() === 'fr';
      this.seo.generateTags({
        title: isFr ? "Connectez-vous" : "Sign In",
        description: isFr 
          ? "Accédez à votre espace guilde sur Guild Manager : calendrier de raids, roster, et cotisations."
          : "Access your guild space on Guild Manager: raid calendar, roster, and membership fees.",
        keywords: "World of Warcraft, Connexion, Battle.net"
      });
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.redirectUrl = params['redirect'] || null;
    });

    // Vérifie si on est déjà connecté pour rediriger vers le dashboard
    this.authService.checkAuth().subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: () => {} // On reste sur la page de login si pas connecté
    });

    // Charger les utilisateurs de test uniquement en développement
    if (!this.isProd) {
      this.authService.getMockUsers().subscribe({
        next: (users) => {
          this.mockUsers.set(users);
          if (users.length > 0) {
            this.selectedMockUser.set(users[0].id);
          }
        },
        error: (err) => {
          console.error('Failed to load mock users', err);
        }
      });
    }
  }

  login() {
    this.isLoading.set(true);
    this.authService.login(this.redirectUrl || undefined);
  }

  onMockLogin() {
    if (!this.selectedMockUser()) return;
    this.isLoading.set(true);
    this.authService.mockLogin(this.selectedMockUser()).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (err) => {
        console.error('Mock login failed', err);
        this.isLoading.set(false);
      }
    });
  }
}
