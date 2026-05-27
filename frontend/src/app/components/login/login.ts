import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent implements OnInit {
  private router = inject(Router);
  isLoading = signal(false);

  constructor(public authService: AuthService) {}

  ngOnInit() {
    // Vérifie si on est déjà connecté pour rediriger vers le dashboard
    this.authService.checkAuth().subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: () => {} // On reste sur la page de login si pas connecté
    });
  }

  login() {
    this.isLoading.set(true);
    this.authService.login();
  }
}
