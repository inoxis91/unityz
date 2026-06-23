import {
  Component,
  computed,
  signal,
  inject,
  OnInit,
  HostListener,
  ElementRef,
} from '@angular/core';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CraftService } from '../../services/craft';

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class NavbarComponent implements OnInit {
  isMenuOpen = signal(false);
  isProfileOpen = signal(false);

  public i18n = inject(I18nService);
  public craftService = inject(CraftService);
  private elementRef = inject(ElementRef);

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
        error: (err) => console.error('Error loading pending crafts for navbar:', err),
      });
    }
  }

  toggleMenu() {
    this.isMenuOpen.update((v) => !v);
  }

  toggleProfile() {
    this.isProfileOpen.update((v) => !v);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
    this.isProfileOpen.set(false);
  }

  closeAllMenus() {
    this.closeMenu();
  }

  logout() {
    this.closeMenu();
    this.authService.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.closeMenu();
    } else {
      const profileDropdown = this.elementRef.nativeElement.querySelector('.profile-dropdown');
      if (profileDropdown && !profileDropdown.contains(event.target)) {
        this.isProfileOpen.set(false);
      }
    }
  }
}
