import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

// Chaque écran est un chunk chargé à la demande : le bundle initial ne contient que le shell.
export const routes: Routes = [
  // Landing in both languages; keep the prerendered list in app.routes.server.ts in sync
  {
    path: '',
    pathMatch: 'full',
    data: { locale: 'fr' },
    loadComponent: () => import('./components/landing/landing').then((m) => m.LandingComponent),
  },
  {
    path: 'en',
    data: { locale: 'en' },
    loadComponent: () => import('./components/landing/landing').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('./components/legal/terms').then((m) => m.TermsOfServiceComponent),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./components/legal/privacy').then((m) => m.PrivacyPolicyComponent),
  },
  {
    path: 'select-guild',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/select-guild/select-guild').then((m) => m.SelectGuildComponent),
  },
  {
    path: 'payment',
    canActivate: [authGuard],
    loadComponent: () => import('./components/payment/payment').then((m) => m.PaymentComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/dashboard/dashboard').then((m) => m.DashboardComponent),
  },
  {
    path: 'guild-characters',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/guild-characters/guild-characters').then(
        (m) => m.GuildCharactersComponent,
      ),
  },
  {
    path: 'options',
    canActivate: [authGuard],
    loadComponent: () => import('./components/options/options').then((m) => m.OptionsComponent),
  },
  {
    path: 'absences',
    canActivate: [authGuard],
    loadComponent: () => import('./components/absences/absences').then((m) => m.AbsencesComponent),
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
    loadComponent: () => import('./components/calendar/calendar').then((m) => m.CalendarComponent),
  },
  {
    path: 'fees',
    canActivate: [authGuard],
    loadComponent: () => import('./components/fees/fees').then((m) => m.FeesComponent),
  },
  {
    path: 'crafts',
    canActivate: [authGuard],
    loadComponent: () => import('./components/crafts/crafts').then((m) => m.CraftsComponent),
  },
  {
    path: 'guild-help',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/guild-help/guild-help').then((m) => m.GuildHelpComponent),
  },
  {
    path: 'events/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/event-details/event-details').then((m) => m.EventDetailsComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./components/admin/admin').then((m) => m.AdminComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./components/not-found/not-found').then((m) => m.NotFoundComponent),
  },
];
