import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { LOCALIZED_PATHS, SeoService } from '../../services/seo';

/** Unknown URL: the backend answers 404 and this page keeps it out of search results. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly path = this.router.url.split(/[?#]/)[0];
  readonly isLoggedIn = computed(() => !!this.auth.currentUser());
  readonly homePath = computed(() => LOCALIZED_PATHS[this.i18n.currentLocale()]);

  constructor() {
    const locale = this.i18n.currentLocale();
    inject(SeoService).apply({
      title:
        locale === 'fr' ? 'Page introuvable – Guild Manager' : 'Page not found – Guild Manager',
      description: this.i18n.t('not_found.text'),
      path: this.path,
      locale,
      noindex: true,
    });
  }
}
