import { Component, computed } from '@angular/core';
import { AuthService } from '../../services/auth';
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
  isAdmin = computed(() => {
    const user = this.authService.currentUser();
    return user?.is_admin === true;
  });

  constructor(public authService: AuthService) {}

  logout() {
    this.authService.logout();
  }
}
