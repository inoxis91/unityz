import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export type UserRole = 'admin' | 'raid_leader' | 'treasurer' | 'event_manager' | 'member';

export interface User {
  id: string;
  battletag: string;
  bnet_id: number;
  discord_id?: string | null;
  role: UserRole;
  has_characters: boolean;
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  currentUser = signal<User | null>(null);

  // Computed permissions
  isAdmin = computed(() => this.currentUser()?.role === 'admin');
  isRaidLeader = computed(() => this.currentUser()?.role === 'raid_leader');
  isTreasurer = computed(() => this.currentUser()?.role === 'treasurer');
  isEventManager = computed(() => this.currentUser()?.role === 'event_manager');

  canManageRosters = computed(() => this.isAdmin() || this.isRaidLeader());
  canManageEvents = computed(() => this.isAdmin() || this.isRaidLeader() || this.isEventManager());
  canManageFees = computed(() => this.isAdmin() || this.isTreasurer());
  canAccessAdmin = computed(() => this.isAdmin() || this.canManageRosters() || this.canManageFees());

  private router = inject(Router);

  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`, { withCredentials: true });
  }

  updateUserRole(userId: string, role: UserRole): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/${userId}/role`, { role }, { withCredentials: true });
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${userId}`, { withCredentials: true });
  }

  checkAuth(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/me`, { withCredentials: true }).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  updateDiscordId(discordId: string | null): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/discord`, { discordId }, { withCredentials: true }).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  linkDiscord(): void {
    window.location.href = `${this.apiUrl}/auth/discord`;
  }

  login(): void {
    window.location.href = `${this.apiUrl}/auth/bnet`;
  }

  logout(): void {
    this.http.get(`${this.apiUrl}/auth/logout`, { withCredentials: true }).subscribe(() => {
      this.currentUser.set(null);
      this.router.navigate(['/login']);
    });
  }
}
