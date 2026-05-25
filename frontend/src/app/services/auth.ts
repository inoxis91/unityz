import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface User {
  id: string;
  battletag: string;
  bnet_id: number;
  is_admin: boolean;
  created_at?: string;
  updated_at?: string;
}

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  currentUser = signal<User | null>(null);

  constructor(private http: HttpClient) {}

  checkAuth(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/me`, { withCredentials: true }).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  login(): void {
    window.location.href = `${this.apiUrl}/auth/bnet`;
  }

  logout(): void {
    this.http.get(`${this.apiUrl}/auth/logout`, { withCredentials: true }).subscribe(() => {
      this.currentUser.set(null);
      window.location.href = '/login';
    });
  }
}
