import { Component, computed, inject } from '@angular/core';
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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterModule,
    NavbarComponent,
    ToastComponent,
    ConfirmComponent,
    SupportWidgetComponent,
  ],
  template: `
    @if (!isPublicPage()) {
      <app-navbar></app-navbar>
    }
    @if (showDiscordWarning()) {
      <div class="discord-warning-banner">
        <div class="banner-content">
          <span class="banner-icon">⚠️</span>
          <span class="banner-text">
            {{ i18n.t('banner.discord_warning') }}
          </span>
          <a routerLink="/options" class="banner-link">{{ i18n.t('banner.discord_link_btn') }}</a>
        </div>
      </div>
    }
    <main [class.full-width]="isFullWidthPage()">
      <router-outlet></router-outlet>
    </main>
    <footer class="app-footer">
      <div class="footer-content">
        <span class="copyright">© 2026 Guild Manager. All rights reserved.</span>
        <div class="footer-links">
          <a routerLink="/terms">{{ i18n.t('footer.terms') }}</a>
          <span class="dot">•</span>
          <a routerLink="/privacy">{{ i18n.t('footer.privacy') }}</a>
        </div>
      </div>
    </footer>
    <app-toast></app-toast>
    <app-confirm></app-confirm>
    <app-support-widget></app-support-widget>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }

      .discord-warning-banner {
        background-color: #ef4444;
        color: white;
        padding: 12px 20px;
        font-size: 0.9rem;
        font-weight: 600;
        width: 100%;
        box-sizing: border-box;
        border-bottom: 1px solid #dc2626;
        z-index: 10;
      }

      .banner-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .banner-icon {
        font-size: 1.1rem;
      }

      .banner-text {
        text-align: center;
      }

      .banner-link {
        color: white;
        text-decoration: underline;
        font-weight: 700;
        transition: opacity 0.2s;
      }

      .banner-link:hover {
        opacity: 0.8;
      }

      main {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
        flex-grow: 1;
        width: 100%;
        box-sizing: border-box;
      }

      main.full-width {
        padding: 0;
        max-width: none;
        margin: 0;
        flex-grow: 1;
        width: 100%;
      }

      .app-footer {
        padding: 24px 20px;
        background: transparent;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        font-size: 0.825rem;
        color: #64748b;
        width: 100%;
        box-sizing: border-box;
      }

      .footer-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 1200px;
        margin: 0 auto;
        flex-wrap: wrap;
        gap: 12px;
      }

      .footer-links {
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .footer-links a {
        color: #64748b;
        text-decoration: none;
        transition: color 0.2s;
        font-weight: 500;
      }

      .footer-links a:hover {
        color: #3b82f6;
      }

      .footer-links .dot {
        color: rgba(255, 255, 255, 0.08);
      }

      @media (max-width: 600px) {
        .footer-content {
          flex-direction: column;
          text-align: center;
        }
      }
    `,
  ],
})
export class AppComponent {
  private router = inject(Router);
  public i18n = inject(I18nService);
  private authService = inject(AuthService);

  showDiscordWarning = computed(() => {
    const user = this.authService.currentUser();
    if (this.isPublicPage()) return false;
    return !!user && (!user.discord_id || user.discord_id.trim() === '');
  });

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

  title = 'Guild Manager';
}
