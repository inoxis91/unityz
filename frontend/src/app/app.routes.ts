import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { CharacterManagerComponent } from './components/character-manager/character-manager';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'characters', component: CharacterManagerComponent },
  { path: '**', redirectTo: '' }
];
