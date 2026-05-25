import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { CharacterManagerComponent } from './components/character-manager/character-manager';
import { CalendarComponent } from './components/calendar/calendar';
import { AdminComponent } from './components/admin/admin';
import { EventDetailsComponent } from './components/event-details/event-details';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'characters', component: CharacterManagerComponent },
  { path: 'calendar', component: CalendarComponent },
  { path: 'events/:id', component: EventDetailsComponent },
  { path: 'admin', component: AdminComponent },
  { path: '**', redirectTo: '' }
];
