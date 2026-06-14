import { Component, computed, signal, inject, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CraftService } from '../../services/craft';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent implements OnInit {
  isMenuOpen = signal(false);
  public i18n = inject(I18nService);
  public craftService = inject(CraftService);

  isAdmin = computed(() => {
    return this.authService.isAdmin();
  });

  pendingCraftsCount = computed(() => {
    return this.craftService.pendingRequestsCount();
  });

  constructor(public authService: AuthService) {}

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user && user.has_characters && user.active_guild_id && user.active_guild_is_paid) {
      this.craftService.loadPendingRequests().subscribe({
        error: (err) => console.error('Error loading pending crafts for navbar:', err)
      });
    }
  }

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
