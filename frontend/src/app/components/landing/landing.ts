import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { I18nService } from '../../services/i18n';
import { AuthService } from '../../services/auth';
import { SeoService } from '../../services/seo';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.html',
  styleUrl: './landing.css'
})
export class LandingComponent implements OnInit {
  public i18n = inject(I18nService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private seo = inject(SeoService);

  constructor() {
    effect(() => {
      const isFr = this.i18n.currentLocale() === 'fr';
      this.seo.generateTags({
        title: isFr ? "Gérez votre Guilde WoW comme des Pros" : "Manage Your WoW Guild Like a Pro",
        description: isFr 
          ? "La plateforme SaaS ultime pour coordonner vos rosters, calendrier de raids, cotisations de banque et plus."
          : "The ultimate all-in-one SaaS platform to coordinate rosters, raid calendars, guild bank fees, and more.",
        keywords: "World of Warcraft, WoW, Guilde, Roster, Raid, Trésorerie, Battle.net"
      });
    });
  }

  ngOnInit() {
    this.authService.checkAuth().subscribe({
      next: () => {
        // Rediriger vers l'application connectée si déjà authentifié
        this.router.navigate(['/dashboard']);
      },
      error: () => {}
    });
  }

  changeLang(lang: 'fr' | 'en') {
    this.i18n.setLocale(lang);
  }

  login() {
    this.router.navigate(['/login']);
  }

  scrollToPricing() {
    const element = document.getElementById('pricing');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
