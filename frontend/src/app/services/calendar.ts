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
  registrations_locked?: boolean;
  logs?: string | null;
  created_by?: string;
  creator_name?: string;
}

export type RaidRole = 'tank' | 'heal' | 'dps';
/** null = en attente de décision du raid lead. */
export type LineupSelection = 'selected' | 'benched' | null;

export interface LineupEntry {
  user_id: string;
  role: RaidRole;
  selection: LineupSelection;
  assigned_role: RaidRole | null;
}

export interface LineupPatch {
  selection?: LineupSelection;
  assigned_role?: RaidRole | null;
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
  selection?: LineupSelection;
  assigned_role?: RaidRole | null;
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
  avoidableDeaths: number;
  damageTaken: number;
  activeTime: number;
  parse: number;
  burstPotionsUsed?: number;
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

export interface WclMvpEntry {
  name: string;
  class: string;
  score: number;
  dpsTotal: number;
  hpsTotal: number;
  deathsCount: number;
  damageTakenSum: number;
  burstPotionsUsed: number;
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
  totalDeaths: number;
  avgActiveTime: number;
  mostDeadlyBoss: string;
  mvpPlayer: { name: string; class: string; score: number };
  mostDiedPlayer: { name: string; class: string; deaths: number } | null;
  leastDiedPlayer: { name: string; class: string; deaths: number } | null;
  mvpLeaderboard: WclMvpEntry[];
  fights: WclFight[];
  wclKeysMissing?: boolean;
}

/** Rôle réellement joué : celui imposé par le raid lead, sinon celui choisi par le joueur. */
export function effectiveRole(signup: Pick<Signup, 'role' | 'assigned_role'>): RaidRole {
  return (signup.assigned_role ?? signup.role) as RaidRole;
}

/** Rôles jouables : ceux du personnage inscrit, plus le rôle déclaré par le joueur (miroir du backend). */
export function playableRoles(signup: Signup): Set<RaidRole> {
  const roles = new Set<RaidRole>([signup.role as RaidRole]);
  const character = signup.user_characters?.find((c) => c.id === signup.character_id);
  if (character?.is_tank) roles.add('tank');
  if (character?.is_heal) roles.add('heal');
  if (character?.is_dps) roles.add('dps');
  return roles;
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

  toggleRegistrationLock(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/toggle-lock`, {}, { withCredentials: true });
  }

  updateGroupsCount(eventId: string, count: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${eventId}/groups-count`, { count }, { withCredentials: true });
  }

  deleteGroup(eventId: string, groupIndex: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${eventId}/groups/${groupIndex}`, { withCredentials: true });
  }

  updateSignupGroup(eventId: string, userId: string, groupIndex: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${eventId}/signups/${userId}/group`, { group_index: groupIndex }, { withCredentials: true });
  }

  updateSignup(eventId: string, userId: string, data: { character_id?: string | null, role?: string, status?: string }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${eventId}/signups/${userId}`, data, { withCredentials: true });
  }

  updateLineupEntry(eventId: string, userId: string, patch: LineupPatch): Observable<LineupEntry> {
    return this.http.patch<LineupEntry>(`${this.apiUrl}/${eventId}/lineup/${userId}`, patch, { withCredentials: true });
  }

  bulkUpdateLineup(eventId: string, userIds: string[], selection: LineupSelection): Observable<LineupEntry[]> {
    return this.http.patch<LineupEntry[]>(`${this.apiUrl}/${eventId}/lineup`, { user_ids: userIds, selection }, { withCredentials: true });
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
