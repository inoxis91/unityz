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
  constructor(public authService: AuthService) {}

  ngOnInit() {
    // Redirection handled by authGuard
  }
}
