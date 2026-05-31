import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError, of } from 'rxjs';

export const adminGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkAuth().pipe(
    map(user => {
      // Must have an active guild context
      if (!user.current_guild_id) {
        router.navigate(['/login'], { queryParams: { sync: 'true', redirect: state.url } });
        return false;
      }

      // Check if user has administrative privilege via service
      if (authService.canAccessAdmin()) {
        return true;
      }
      
      router.navigate(['/dashboard']);
      return false;
    }),
    catchError(() => {
      router.navigate(['/login'], { queryParams: { redirect: state.url } });
      return of(false);
    })
  );
};
