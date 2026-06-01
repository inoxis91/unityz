import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, catchError, shareReplay } from 'rxjs';

export interface Character {
  id?: string;
  name: string;
  realm: string;
  class: string;
  level: number;
  roster_id?: string | null;
  is_tank?: boolean;
  is_heal?: boolean;
  is_dps?: boolean;
  is_main?: boolean;
  rio_score?: number; // Score live non stocké en BDD
  guild?: {
    id: number;
    name: string;
    realm: string;
  } | null;
}

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CharacterService {
  private apiUrl = `${environment.apiUrl}/characters`;
  private rioCache = new Map<string, Observable<number>>();

  static getClassId(className: string | undefined): string {
    if (!className) return 'unknown';
    
    const name = className.toLowerCase().trim();
    
    const map: { [key: string]: string } = {
      'guerrier': 'warrior',
      'paladin': 'paladin',
      'chasseur': 'hunter',
      'voleur': 'rogue',
      'prêtre': 'priest',
      'chevalier de la mort': 'death-knight',
      'chaman': 'shaman',
      'mage': 'mage',
      'démoniste': 'warlock',
      'moine': 'monk',
      'druide': 'druid',
      'chasseur de démons': 'demon-hunter',
      'évocateur': 'evoker'
    };

    return map[name] || name.replace(/\s+/g, '-');
  }

  getWarcraftLogsUrl(name: string | undefined, realm: string | undefined): string {
    if (!name || !realm) return '#';
    const slugRealm = realm.toLowerCase().trim().replace(/\s+/g, '-').replace(/'/g, '');
    return `https://www.warcraftlogs.com/character/eu/${slugRealm}/${name.toLowerCase()}`;
  }

  getRaiderIoUrl(name: string | undefined, realm: string | undefined): string {
    if (!name || !realm) return '#';
    const slugRealm = realm.toLowerCase().trim().replace(/\s+/g, '-').replace(/'/g, '');
    return `https://raider.io/characters/eu/${slugRealm}/${name.toLowerCase()}`;
  }

  getRioScore(name: string, realm: string): Observable<number> {
    const key = `${name}-${realm}`.toLowerCase();
    
    if (this.rioCache.has(key)) {
      return this.rioCache.get(key)!;
    }

    const slugRealm = realm.toLowerCase().trim().replace(/\s+/g, '-').replace(/'/g, '');
    const url = `https://raider.io/api/v1/characters/profile?region=eu&realm=${slugRealm}&name=${name.toLowerCase()}&fields=mythic_plus_scores_by_season:current`;

    const obs = this.http.get<any>(url).pipe(
      map(res => {
        const score = res?.mythic_plus_scores_by_season?.[0]?.scores?.all || 0;
        return Math.round(score);
      }),
      catchError(() => of(0)),
      shareReplay(1)
    );

    this.rioCache.set(key, obs);
    return obs;
  }

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

  // Récupère les détails (image, stuff) d'un personnage via Blizzard
  getCharacterDetails(realm: string, name: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/details/${realm}/${name}`, { withCredentials: true });
  }
}
