import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError, of } from 'rxjs';

export const authGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkAuth().pipe(
    map(user => {
      if (!user) {
        router.navigate(['/login']);
        return false;
      }

      // Si l'utilisateur n'a pas de persos, il ne peut aller QUE sur la page options/characters
      if (!user.has_characters) {
        const isTargetingOptions = state.url.startsWith('/options');
        if (!isTargetingOptions) {
          router.navigate(['/options'], { queryParams: { tab: 'characters', setup: 'true' } });
          return false;
        }
      }

      return true;
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};
