import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet, Router, RouterModule } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar';
import { ToastComponent } from './components/toast/toast';
import { ConfirmComponent } from './components/confirm/confirm';
import { SupportWidgetComponent } from './components/support-widget/support-widget';

import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { I18nService } from './services/i18n';
import { AuthService } from './services/auth';
import { ThemeService } from './services/theme';

const DISCORD_BANNER_KEY = 'gm_discord_banner_dismissed';

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterModule,
    NavbarComponent,
    ToastComponent,
    ConfirmComponent,
    SupportWidgetComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  private router = inject(Router);
  public i18n = inject(I18nService);
  private authService = inject(AuthService);
  // Eager injection keeps <html data-theme> in sync (incl. OS changes) on every page
  private theme = inject(ThemeService);

  /** Bandeau masqué pour la session du navigateur (préférence locale, sans enjeu). */
  readonly discordBannerDismissed = signal(readSession(DISCORD_BANNER_KEY) === '1');

  showDiscordWarning = computed(() => {
    const user = this.authService.currentUser();
    if (this.isPublicPage() || this.discordBannerDismissed()) return false;
    return !!user && !user.discord_id?.trim();
  });

  dismissDiscordBanner() {
    this.discordBannerDismissed.set(true);
    try {
      sessionStorage.setItem(DISCORD_BANNER_KEY, '1');
    } catch {
      // Stockage indisponible (navigation privée) : masqué pour cette page seulement
    }
  }

  // Create a signal from the router events to track the current URL
  private url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => (event as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: '/' },
  );

  isPublicPage = computed(() => {
    const currentUrl = this.url();
    return currentUrl === '/' || currentUrl.startsWith('/login');
  });

  isFullWidthPage = computed(() => {
    const currentUrl = this.url();
    return (
      currentUrl === '/' ||
      currentUrl.startsWith('/login') ||
      currentUrl.startsWith('/select-guild') ||
      currentUrl.startsWith('/payment')
    );
  });

  readonly year = new Date().getFullYear();
}
