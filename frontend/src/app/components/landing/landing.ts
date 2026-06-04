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
        title: isFr ? "Logiciel de Gestion de Guilde WoW & Raid Planner" : "WoW Guild Management Software & Raid Planner",
        description: isFr 
          ? "Optimisez la gestion de votre guilde World of Warcraft. Synchronisation Battle.net, gestionnaire de rosters, calendrier de raids dynamique et suivi de la trésorerie pour les officiers et Guild Masters."
          : "Streamline your World of Warcraft guild management. Battle.net sync, dynamic roster manager, raid calendar planner, and guild treasury tracker for Guild Masters and officers.",
        keywords: isFr
          ? "logiciel gestion guilde wow, gestion de guilde world of warcraft, outil roster wow, raid planner wow, calendrier de raid wow, cotisations guilde wow, guild manager, battle.net api wow"
          : "wow guild management software, world of warcraft guild tools, wow roster manager, wow raid planner, wow raid calendar, guild manager, wow guild bank tracker, battle.net api"
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
