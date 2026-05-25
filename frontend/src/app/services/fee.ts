import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FeeDeclaration {
  id: string;
  user_id: string;
  battletag?: string;
  amount: number;
  start_month: string;
  duration_months: number;
  comment: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  admin_comment: string | null;
  created_at: string;
}

export interface FeeAllocation {
  id: string;
  user_id: string;
  month_date: string;
  amount: number;
}

export interface GuildFeeOverview {
  user_id: string;
  battletag: string;
  allocations: { month: string, amount: number }[];
}

@Injectable({
  providedIn: 'root'
})
export class FeeService {
  private apiUrl = `${environment.apiUrl}/fees`;

  myDeclarations = signal<FeeDeclaration[]>([]);
  myAllocations = signal<FeeAllocation[]>([]);
  pendingDeclarations = signal<FeeDeclaration[]>([]);

  constructor(private http: HttpClient) {}

  loadMyDeclarations(): Observable<FeeDeclaration[]> {
    return this.http.get<FeeDeclaration[]>(`${this.apiUrl}/my-declarations`, { withCredentials: true }).pipe(
      tap(decls => this.myDeclarations.set(decls))
    );
  }

  loadMyAllocations(year: number): Observable<FeeAllocation[]> {
    return this.http.get<FeeAllocation[]>(`${this.apiUrl}/my-allocations/${year}`, { withCredentials: true }).pipe(
      tap(allocs => this.myAllocations.set(allocs))
    );
  }

  declarePayment(data: { amount: number, start_month: string, duration_months: number, comment?: string }): Observable<FeeDeclaration> {
    return this.http.post<FeeDeclaration>(`${this.apiUrl}/declare`, data, { withCredentials: true });
  }

  loadPendingDeclarations(): Observable<FeeDeclaration[]> {
    return this.http.get<FeeDeclaration[]>(`${this.apiUrl}/pending`, { withCredentials: true }).pipe(
      tap(decls => this.pendingDeclarations.set(decls))
    );
  }

  getGuildOverview(year: number): Observable<GuildFeeOverview[]> {
    return this.http.get<GuildFeeOverview[]>(`${this.apiUrl}/guild-overview/${year}`, { withCredentials: true });
  }

  resolveDeclaration(id: string, status: 'accepted' | 'rejected', adminComment?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/resolve/${id}`, { status, admin_comment: adminComment }, { withCredentials: true });
  }
}
