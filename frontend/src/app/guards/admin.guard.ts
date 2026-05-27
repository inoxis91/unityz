import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError, of } from 'rxjs';

export const adminGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkAuth().pipe(
    map(user => {
      if (!user) {
        router.navigate(['/login']);
        return false;
      }

      // Même un admin doit avoir ses persos
      if (!user.has_characters) {
        router.navigate(['/options'], { queryParams: { tab: 'characters', setup: 'true' } });
        return false;
      }

      // Check if user has any administrative privilege
      const role = user.role;
      const hasPrivilege = ['admin', 'raid_leader', 'treasurer', 'event_manager'].includes(role);
      
      if (hasPrivilege) {
        return true;
      }
      router.navigate(['/']);
      return false;
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};
