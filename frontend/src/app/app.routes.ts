import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { LandingComponent } from './components/landing/landing';
import { SelectGuildComponent } from './components/select-guild/select-guild';
import { PaymentComponent } from './components/payment/payment';
import { DashboardComponent } from './components/dashboard/dashboard';
import { OptionsComponent } from './components/options/options';
import { CalendarComponent } from './components/calendar/calendar';
import { AdminComponent } from './components/admin/admin';
import { EventDetailsComponent } from './components/event-details/event-details';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { FeesComponent } from './components/fees/fees';
import { CraftsComponent } from './components/crafts/crafts';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { 
    path: 'select-guild', 
    component: SelectGuildComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'payment', 
    component: PaymentComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [authGuard] 
  },
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
    path: 'crafts', 
    component: CraftsComponent, 
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
    canActivate: [authGuard, adminGuard] 
  },
  { path: '**', redirectTo: '' }
];
