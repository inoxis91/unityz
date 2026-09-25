import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      // Fondu entre les pages (ignoré par les navigateurs sans View Transitions)
      withViewTransitions({ skipInitialTransition: true }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withFetch()),
    // Public pages are prerendered (app.routes.server.ts): reuse their DOM instead of re-rendering
    provideClientHydration(withEventReplay()),
    { provide: LOCALE_ID, useValue: 'fr' },
  ],
};
