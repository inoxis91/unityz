import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth';

/**
 * Back-office : réservé aux admins plateforme. Confort d'affichage uniquement, la vraie
 * protection est côté API (/api/platform répond 404 à tous les autres).
 */
export const platformGuard = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.checkAuth().pipe(
    map((user) => (user.is_platform_admin ? true : router.parseUrl('/'))),
    catchError(() => of(router.parseUrl(`/login?redirect=${encodeURIComponent(state.url)}`))),
  );
};
