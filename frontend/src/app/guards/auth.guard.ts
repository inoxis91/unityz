import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError, of } from 'rxjs';

export const authGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkAuth().pipe(
    map(user => {
      // Pour utiliser l'app, l'utilisateur doit avoir une guilde active sélectionnée
      if (!user.current_guild_id) {
        router.navigate(['/login'], { queryParams: { sync: 'true', redirect: state.url } });
        return false;
      }

      return true;
    }),
    catchError(() => {
      // Rediriger vers la page de login
      router.navigate(['/login'], { queryParams: { redirect: state.url } });
      return of(false);
    })
  );
};
