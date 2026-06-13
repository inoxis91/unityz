import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, switchMap, map } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export type UserRole = 'admin' | 'raid_leader' | 'treasurer' | 'event_manager' | 'member';

export interface User {
  id: string;
  battletag: string;
  bnet_id: number;
  discord_id?: string | null;
  role: UserRole;
  rank?: number | null;
  has_characters: boolean;
  active_guild_id?: string | null;
  active_guild_is_paid?: boolean;
  active_guild_fees_enabled?: boolean;
  active_guild_minimum_fee_amount?: number;
  subscription_tier?: 'free' | 'medium' | 'pro';
  subscription_expires_at?: string | null;
  subscription_status?: string | null;
  created_at?: string;
  updated_at?: string;
  characters?: any[];
  birthday?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  currentUser = signal<User | null>(null);
  currentGuild = signal<any | null>(null);

  // Computed permissions
  isAdmin = computed(() => this.currentUser()?.role === 'admin');
  isRaidLeader = computed(() => this.currentUser()?.role === 'raid_leader');
  isTreasurer = computed(() => this.currentUser()?.role === 'treasurer');
  isEventManager = computed(() => this.currentUser()?.role === 'event_manager');

  isGMOrOfficer = computed(() => {
    const rank = this.currentUser()?.rank;
    return rank !== undefined && rank !== null && rank <= 2;
  });

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

  getUserGuilds(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/me/guilds`, { withCredentials: true });
  }

  getActiveGuild(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/users/me/active-guild`, { withCredentials: true }).pipe(
      tap(guild => this.currentGuild.set(guild))
    );
  }

  setActiveGuild(guildId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/users/active-guild`, { guildId }, { withCredentials: true }).pipe(
      switchMap(res => this.checkAuth().pipe(
        map(() => res)
      ))
    );
  }

  importCharacters(characters: any[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/users/import-characters`, { characters }, { withCredentials: true }).pipe(
      switchMap(res => this.checkAuth().pipe(
        map(() => res)
      ))
    );
  }

  checkAuth(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/me`, { withCredentials: true }).pipe(
      tap({
        next: user => {
          this.currentUser.set(user);
          if (user && user.active_guild_id) {
            this.getActiveGuild().subscribe();
          } else {
            this.currentGuild.set(null);
          }
        },
        error: () => {
          this.currentUser.set(null);
          this.currentGuild.set(null);
        }
      })
    );
  }

  updateDiscordId(discordId: string | null): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/discord`, { discordId }, { withCredentials: true }).pipe(
      switchMap(user => this.checkAuth().pipe(
        map(() => user)
      ))
    );
  }

  updateBirthday(birthday: string | null): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/birthday`, { birthday }, { withCredentials: true }).pipe(
      switchMap(user => this.checkAuth().pipe(
        map(() => user)
      ))
    );
  }

  getGuildBirthdays(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/active-guild/birthdays`, { withCredentials: true });
  }

  getAttendance(): Observable<{
    percentage: number;
    total_eligible: number;
    attended: number;
    events: any[];
  }> {
    return this.http.get<any>(`${this.apiUrl}/users/me/attendance`, { withCredentials: true });
  }

  getGuildAttendance(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/active-guild/attendance`, { withCredentials: true });
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

  getMockUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/mock-auth/users`, { withCredentials: true });
  }

  mockLogin(mockUserId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/mock-auth/login`, { mockUserId }, { withCredentials: true }).pipe(
      tap(res => {
        if (res.status === 'success') {
          this.currentUser.set(res.user);
        }
      })
    );
  }

  logout(): void {
    this.http.get(`${this.apiUrl}/auth/logout`, { withCredentials: true }).subscribe(() => {
      this.currentUser.set(null);
      this.router.navigate(['/login']);
    });
  }
}
