import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CalendarEvent {
  id?: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  type: string;
  roster_id?: string | null;
  mm_groups_count?: number;
  roster_name?: string | null;
  roster_weight?: number | null;
  invited_groups?: string[];
  is_canceled?: boolean;
  canceled_reason?: string | null;
  logs?: string | null;
  created_by?: string;
  creator_name?: string;
}

export interface Signup {
  id: string;
  event_id: string;
  user_id: string;
  character_id: string | null;
  role: string;
  status: string;
  group_index: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  character_name?: string;
  character_class?: string;
  character_realm?: string;
  main_character_name?: string;
  main_character_class?: string;
  main_character_realm?: string;
  battletag?: string;
  signup_date?: string;
  user_characters?: any[];
}

export interface WclPlayerPerf {
  name: string;
  class: string;
  role: 'tank' | 'heal' | 'dps';
  dps: number;
  hps: number;
  deaths: number;
  damageTaken: number;
  activeTime: number;
  parse: number;
}

export interface WclFight {
  id: number;
  name: string;
  difficulty: string;
  kill: boolean;
  duration: number;
  bossPercentage: number;
  deathsCount: number;
  averageDps: number;
  averageHps: number;
  players: WclPlayerPerf[];
}

export interface WclReportMetrics {
  title: string;
  zone: string;
  owner: string;
  totalDuration: number;
  totalKills: number;
  totalWipes: number;
  totalDamage: number;
  totalHealing: number;
  raidAvgDps: number;
  raidAvgHps: number;
  avgSurvivalRate: number;
  avgActiveTime: number;
  mostDeadlyBoss: string;
  mvpPlayer: { name: string; class: string; score: number };
  fights: WclFight[];
  wclKeysMissing?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private apiUrl = `${environment.apiUrl}/events`;

  constructor(private http: HttpClient) {}

  getEvents(): Observable<CalendarEvent[]> {
    return this.http.get<CalendarEvent[]>(this.apiUrl, { withCredentials: true });
  }

  getEvent(id: string): Observable<CalendarEvent> {
    return this.http.get<CalendarEvent>(`${this.apiUrl}/${id}`, { withCredentials: true });
  }

  createEvent(event: CalendarEvent): Observable<CalendarEvent> {
    return this.http.post<CalendarEvent>(this.apiUrl, event, { withCredentials: true });
  }

  updateEvent(id: string, event: CalendarEvent): Observable<CalendarEvent> {
    return this.http.put<CalendarEvent>(`${this.apiUrl}/${id}`, event, { withCredentials: true });
  }

  deleteEvent(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { withCredentials: true });
  }

  remindEvent(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/remind`, {}, { withCredentials: true });
  }

  cancelEvent(id: string, reason: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/cancel`, { reason }, { withCredentials: true });
  }

  updateGroupsCount(eventId: string, count: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${eventId}/groups-count`, { count }, { withCredentials: true });
  }

  updateSignupGroup(eventId: string, userId: string, groupIndex: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${eventId}/signups/${userId}/group`, { group_index: groupIndex }, { withCredentials: true });
  }

  updateSignup(eventId: string, userId: string, data: { character_id?: string | null, role?: string, status?: string }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${eventId}/signups/${userId}`, data, { withCredentials: true });
  }

  getSignups(eventId: string): Observable<Signup[]> {
    return this.http.get<Signup[]>(`${this.apiUrl}/${eventId}/signups`, { withCredentials: true });
  }

  signup(eventId: string, data: any): Observable<Signup> {
    return this.http.post<Signup>(`${this.apiUrl}/${eventId}/signup`, data, { withCredentials: true });
  }

  unsignup(eventId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${eventId}/signup`, { withCredentials: true });
  }

  getMySignups(): Observable<Signup[]> {
    return this.http.get<Signup[]>(`${this.apiUrl}/my-signups`, { withCredentials: true });
  }

  getEventLogsMetrics(eventId: string): Observable<WclReportMetrics> {
    return this.http.get<WclReportMetrics>(`${this.apiUrl}/${eventId}/logs-metrics`, { withCredentials: true });
  }
}
