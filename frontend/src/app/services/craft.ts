import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CraftRequest {
  id: string;
  guild_id: string;
  user_id: string;
  slot: string;
  armor_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  battletag?: string;
  main_character_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CraftService {
  private apiUrl = `${environment.apiUrl}/crafts`;

  pendingRequests = signal<CraftRequest[]>([]);
  pendingRequestsCount = computed(() => this.pendingRequests().length);

  constructor(private http: HttpClient) {}

  loadPendingRequests(): Observable<CraftRequest[]> {
    return this.http.get<CraftRequest[]>(`${this.apiUrl}/pending`, { withCredentials: true }).pipe(
      tap(reqs => this.pendingRequests.set(reqs))
    );
  }

  createRequest(slot: string, armorType: string): Observable<any> {
    return this.http.post(`${this.apiUrl}`, { slot, armorType }, { withCredentials: true }).pipe(
      tap(() => this.loadPendingRequests().subscribe())
    );
  }

  completeRequest(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { withCredentials: true }).pipe(
      tap(() => this.loadPendingRequests().subscribe())
    );
  }
}
