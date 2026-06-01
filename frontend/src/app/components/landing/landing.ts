import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { I18nService } from '../../services/i18n';
import { AuthService } from '../../services/auth';

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
