import { Component, computed, signal, inject } from '@angular/core';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  isMenuOpen = signal(false);
  public i18n = inject(I18nService);

  isAdmin = computed(() => {
    return this.authService.isAdmin();
  });

  constructor(public authService: AuthService) {}

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }

  logout() {
    this.closeMenu();
    this.authService.logout();
  }
}
