import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export interface Guild {
  id: string;
  name: string;
  realm: string;
  subscription_status: string;
  rank: number | null;
}

export interface User {
  id: string;
  battletag: string;
  bnet_id: number;
  discord_id?: string | null;
  current_guild_id: string | null;
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

  // We temporarily disable fine-grained permissions based on a single rank 
  // since roles are now dynamic based on the active guild.
  // For this iteration, Rank 0 and 1 are admins.
  // We'll refine this later by fetching the active guild rank alongside user data.
  // For now, these default to true if the user is authenticated to keep other pages working, 
  // but the real check is done via adminGuard and backend API.
  isAdmin = computed(() => !!this.currentUser());
  canManageRosters = computed(() => !!this.currentUser());
  canManageEvents = computed(() => !!this.currentUser());
  canManageFees = computed(() => !!this.currentUser());
  canAccessAdmin = computed(() => !!this.currentUser());

  private router = inject(Router);

  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`, { withCredentials: true });
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${userId}`, { withCredentials: true });
  }

  checkAuth(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/me`, { withCredentials: true }).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  syncGuilds(): Observable<Guild[]> {
    return this.http.get<Guild[]>(`${this.apiUrl}/auth/sync`, { withCredentials: true });
  }

  setActiveGuild(guildId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/active-guild`, { guildId }, { withCredentials: true });
  }

  subscribeToGuild(guildId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/guilds/${guildId}/subscribe`, {}, { withCredentials: true });
  }

  updateDiscordId(discordId: string | null): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/discord`, { discordId }, { withCredentials: true }).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  linkDiscord(): void {
    window.location.href = `${this.apiUrl}/auth/discord`;
  }

  login(redirectUrl?: string): void {
    let url = `${this.apiUrl}/auth/bnet`;
    if (redirectUrl) {
      url += `?redirect=${encodeURIComponent(redirectUrl)}`;
    }
    window.location.href = url;
  }

  logout(): void {
    this.http.get(`${this.apiUrl}/auth/logout`, { withCredentials: true }).subscribe(() => {
      this.currentUser.set(null);
      this.router.navigate(['/login']);
    });
  }
}
