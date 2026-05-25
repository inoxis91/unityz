import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { CharacterManagerComponent } from './components/character-manager/character-manager';
import { CalendarComponent } from './components/calendar/calendar';
import { AdminComponent } from './components/admin/admin';
import { EventDetailsComponent } from './components/event-details/event-details';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'characters', 
    component: CharacterManagerComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'calendar', 
    component: CalendarComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'events/:id', 
    component: EventDetailsComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'admin', 
    component: AdminComponent, 
    canActivate: [adminGuard] 
  },
  { path: '**', redirectTo: '' }
];
