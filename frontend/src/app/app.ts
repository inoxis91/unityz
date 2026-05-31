import { Component, computed, inject, effect } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar';
import { ToastComponent } from './components/toast/toast';
import { ConfirmComponent } from './components/confirm/confirm';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, ToastComponent, ConfirmComponent],
  template: `
    <app-navbar *ngIf="!isFullPage()"></app-navbar>
    <main [class.full-page-mode]="isFullPage()">
      <router-outlet></router-outlet>
    </main>
    <app-toast></app-toast>
    <app-confirm></app-confirm>
  `,
  styles: [`
    main {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
      min-height: calc(100vh - 80px);
    }

    main.full-page-mode {
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
    { initialValue: this.router.url } // Use current url as initial value
  );

  isFullPage = computed(() => {
    const currentUrl = this.url();
    return currentUrl.startsWith('/login') || currentUrl === '/';
  });

  constructor() {
    // Dynamically apply a dark background class to both html and body
    // when displaying full-page views (landing, login) to prevent white bands on scroll/bounce
    effect(() => {
      if (this.isFullPage()) {
        document.body.classList.add('dark-body-theme');
        document.documentElement.classList.add('dark-body-theme');
      } else {
        document.body.classList.remove('dark-body-theme');
        document.documentElement.classList.remove('dark-body-theme');
      }
    });
  }

  title = "Guild Manager";
}
