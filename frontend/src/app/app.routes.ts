import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { OptionsComponent } from './components/options/options';
import { CalendarComponent } from './components/calendar/calendar';
import { AdminComponent } from './components/admin/admin';
import { EventDetailsComponent } from './components/event-details/event-details';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { FeesComponent } from './components/fees/fees';

export const routes: Routes = [
  { 
    path: '', 
    component: DashboardComponent, 
    canActivate: [authGuard] 
  },
  { path: 'login', component: LoginComponent },
  { 
    path: 'options', 
    component: OptionsComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'calendar', 
    component: CalendarComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'fees', 
    component: FeesComponent, 
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
