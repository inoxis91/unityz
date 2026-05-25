import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Character } from './character';

export interface Roster {
  id: string;
  name: string;
  description: string | null;
  characters?: Character[];
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RosterService {
  private apiUrl = `${environment.apiUrl}/rosters`;
  
  rosters = signal<Roster[]>([]);
  unassignedCharacters = signal<Character[]>([]);

  constructor(private http: HttpClient) {}

  loadRosters(): Observable<Roster[]> {
    return this.http.get<Roster[]>(this.apiUrl, { withCredentials: true }).pipe(
      tap(rosters => this.rosters.set(rosters))
    );
  }

  loadUnassignedCharacters(): Observable<Character[]> {
    return this.http.get<Character[]>(`${this.apiUrl}/unassigned`, { withCredentials: true }).pipe(
      tap(chars => this.unassignedCharacters.set(chars))
    );
  }

  getMyRoster(): Observable<Roster | null> {
    return this.http.get<Roster | null>(`${this.apiUrl}/my-roster`, { withCredentials: true });
  }

  createRoster(data: Partial<Roster>): Observable<Roster> {
    return this.http.post<Roster>(this.apiUrl, data, { withCredentials: true }).pipe(
      tap(() => this.loadRosters().subscribe())
    );
  }

  updateRoster(id: string, data: Partial<Roster>): Observable<Roster> {
    return this.http.put<Roster>(`${this.apiUrl}/${id}`, data, { withCredentials: true }).pipe(
      tap(() => this.loadRosters().subscribe())
    );
  }

  deleteRoster(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { withCredentials: true }).pipe(
      tap(() => {
        this.loadRosters().subscribe();
        this.loadUnassignedCharacters().subscribe();
      })
    );
  }

  assignCharacter(characterId: string, rosterId: string | null): Observable<any> {
    return this.http.patch(`${this.apiUrl}/assign/${characterId}`, { rosterId }, { withCredentials: true });
  }
}
