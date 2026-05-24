import { Component, OnInit } from '@angular/core';
import { AuthService, User } from '../../services/auth';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  user: User | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authService.checkAuth().subscribe({
      next: (user) => this.user = user,
      error: () => window.location.href = '/login'
    });
  }
}
