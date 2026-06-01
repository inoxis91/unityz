import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError, of } from 'rxjs';

export const authGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkAuth().pipe(
    map(user => {
      // 1. Si l'utilisateur n'a pas de guilde active sélectionnée, il doit aller sur select-guild
      if (!user.active_guild_id) {
        const isAllowedRoute = state.url.startsWith('/select-guild');
        if (!isAllowedRoute) {
          router.navigate(['/select-guild']);
          return false;
        }
        return true;
      }

      // 2. Si la guilde active n'est pas payée, redirection vers payment
      if (!user.active_guild_is_paid) {
        const isAllowedRoute = state.url.startsWith('/payment') || state.url.startsWith('/select-guild');
        if (!isAllowedRoute) {
          router.navigate(['/payment']);
          return false;
        }
        return true;
      }

      // 3. Si la guilde active est payée, mais que l'utilisateur n'a pas encore importé de personnages, redirection vers select-guild (Step 2)
      if (!user.has_characters) {
        const isAllowedRoute = state.url.startsWith('/select-guild');
        if (!isAllowedRoute) {
          router.navigate(['/select-guild']);
          return false;
        }
        return true;
      }

      // 4. Si la fonctionnalité de cotisation est désactivée, bloquer l'accès aux cotisations
      if (state.url.startsWith('/fees') && !user.active_guild_fees_enabled) {
        router.navigate(['/dashboard']);
        return false;
      }

      return true;
    }),
    catchError(() => {
      // Rediriger vers la page de login locale avec l'URL de retour
      router.navigate(['/login'], { queryParams: { redirect: state.url } });
      return of(false);
    })
  );
};
