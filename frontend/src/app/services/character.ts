import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Character {
  id?: string;
  name: string;
  realm: string;
  class: string;
  level: number;
  is_tank?: boolean;
  is_heal?: boolean;
  is_dps?: boolean;
  is_main?: boolean;
}

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CharacterService {
  private apiUrl = `${environment.apiUrl}/characters`;

  constructor(private http: HttpClient) {}

  // Récupère les persos depuis Battle.net
  getBnetCharacters(): Observable<Character[]> {
    return this.http.get<Character[]>(`${this.apiUrl}/bnet`, { withCredentials: true });
  }

  // Récupère les persos importés en base
  getMyCharacters(): Observable<Character[]> {
    return this.http.get<Character[]>(this.apiUrl, { withCredentials: true });
  }

  // Importe des personnages
  importCharacters(characters: Character[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/import`, { characters }, { withCredentials: true });
  }

  // Met à jour les rôles
  updateRoles(charId: string, roles: { isTank: boolean, isHeal: boolean, isDPS: boolean }): Observable<Character> {
    return this.http.patch<Character>(`${this.apiUrl}/${charId}/roles`, roles, { withCredentials: true });
  }

  // Définit le perso comme principal
  setMainCharacter(charId: string): Observable<Character> {
    return this.http.patch<Character>(`${this.apiUrl}/${charId}/main`, {}, { withCredentials: true });
  }

  // Supprime un perso de la base
  removeCharacter(charId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${charId}`, { withCredentials: true });
  }
}
