import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar';
import { ToastComponent } from './components/toast/toast';
import { ConfirmComponent } from './components/confirm/confirm';
import { SupportWidgetComponent } from './components/support-widget/support-widget';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, ToastComponent, ConfirmComponent, SupportWidgetComponent],
  template: `
    <app-navbar *ngIf="!isPublicPage()"></app-navbar>
    <main [class.full-width]="isFullWidthPage()">
      <router-outlet></router-outlet>
    </main>
    <app-toast></app-toast>
    <app-confirm></app-confirm>
    <app-support-widget></app-support-widget>
  `,
  styles: [`
    main {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
      min-height: calc(100vh - 80px);
    }

    main.full-width {
      padding: 0;
      max-width: none;
      margin: 0;
      min-height: 100vh;
    }
  `]
})
export class AppComponent {
  private router = inject(Router);
  
  // Create a signal from the router events to track the current URL
  private url = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(event => (event as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: '/' }
  );

  isPublicPage = computed(() => {
    const currentUrl = this.url();
    return currentUrl === '/' || currentUrl.startsWith('/login');
  });

  isFullWidthPage = computed(() => {
    const currentUrl = this.url();
    return currentUrl === '/' || currentUrl.startsWith('/login') || currentUrl.startsWith('/select-guild') || currentUrl.startsWith('/payment');
  });

  title = 'Guild Manager';
}
