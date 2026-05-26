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
  roster_name?: string | null;
  roster_weight?: number | null;
  created_by?: string;
  creator_name?: string;
}

export interface Signup {
  id?: string;
  event_id: string;
  user_id: string;
  character_id: string | null;
  role: 'tank' | 'heal' | 'dps';
  status: 'signed_up' | 'confirmed' | 'standby' | 'declined' | 'absent';
  comment?: string;
  signup_date?: string;
  character_name?: string;
  character_class?: string;
  main_character_name?: string;
  main_character_class?: string;
  battletag?: string;
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

  getSignups(eventId: string): Observable<Signup[]> {
    return this.http.get<Signup[]>(`${this.apiUrl}/${eventId}/signups`, { withCredentials: true });
  }

  signup(eventId: string, signupData: { character_id: string | null, role: string, comment?: string, status?: string }): Observable<Signup> {
    return this.http.post<Signup>(`${this.apiUrl}/${eventId}/signup`, signupData, { withCredentials: true });
  }

  unsignup(eventId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${eventId}/signup`, { withCredentials: true });
  }

  getMySignups(): Observable<Signup[]> {
    return this.http.get<Signup[]>(`${this.apiUrl}/my-signups`, { withCredentials: true });
  }
}
