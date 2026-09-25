import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, catchError, shareReplay } from 'rxjs';

export interface Character {
  id?: string;
  name: string;
  realm: string;
  class: string;
  level: number;
  roster_id?: string | null;
  roster_role?: 'tank' | 'heal' | 'dps' | null;
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
  roster_name?: string | null;
}

export interface GuildCharacterOverview {
  id: string;
  name: string;
  realm: string;
  class: string;
  level: number;
  is_tank: boolean;
  is_heal: boolean;
  is_dps: boolean;
  is_main: boolean;
  roster_id: string | null;
  roster_name: string | null;
  owner_battletag: string;
  owner_id: string;
}

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import {
  DEFAULT_REGION,
  WowRegion,
  raiderIoCharacterUrl,
  toRealmSlug,
  warcraftLogsCharacterUrl,
} from './character-utils';

@Injectable({
  providedIn: 'root'
})
export class CharacterService {
  private apiUrl = `${environment.apiUrl}/characters`;
  private rioCache = new Map<string, Observable<number>>();
  private auth = inject(AuthService);

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

  /** Icône de classe (`assets/icons/class/`) à partir du nom de classe FR ou EN. */
  static getClassIcon(className: string | undefined): string {
    const icons: Record<string, string> = {
      warrior: 'warrior', paladin: 'paladin', hunter: 'hunt', rogue: 'rogue', priest: 'priest',
      'death-knight': 'dk', shaman: 'shaman', mage: 'mage', warlock: 'warlock', monk: 'monk',
      druid: 'drood', 'demon-hunter': 'dh', evoker: 'evoker',
    };
    return `assets/icons/class/${icons[CharacterService.getClassId(className)] ?? 'warrior'}.webp`;
  }

  /** Region of the active guild: every character shown in the app belongs to it. */
  private region(): WowRegion {
    return this.auth.currentUser()?.active_guild_region ?? DEFAULT_REGION;
  }

  getWarcraftLogsUrl(name: string | undefined, realm: string | undefined): string {
    return warcraftLogsCharacterUrl(this.region(), name, realm);
  }

  getRaiderIoUrl(name: string | undefined, realm: string | undefined): string {
    return raiderIoCharacterUrl(this.region(), name, realm);
  }

  getRioScore(name: string, realm: string): Observable<number> {
    const region = this.region();
    const key = `${region}-${name}-${realm}`.toLowerCase();

    if (this.rioCache.has(key)) {
      return this.rioCache.get(key)!;
    }

    const params = {
      region,
      realm: toRealmSlug(realm),
      name: name.toLowerCase(),
      fields: 'mythic_plus_scores_by_season:current',
    };

    const obs = this.http.get<any>('https://raider.io/api/v1/characters/profile', { params }).pipe(
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
    return this.http.get<any>(`${this.apiUrl}/details/${encodeURIComponent(realm)}/${encodeURIComponent(name)}`, { withCredentials: true });
  }

  // Récupère l'ensemble des personnages de la guilde active (Vue admin)
  getGuildCharactersOverview(): Observable<GuildCharacterOverview[]> {
    return this.http.get<GuildCharacterOverview[]>(`${this.apiUrl}/guild-overview`, { withCredentials: true });
  }

  // Récupère l'ensemble des personnages de la guilde active (Vue membre public)
  getGuildCharactersRoster(): Observable<GuildCharacterOverview[]> {
    return this.http.get<GuildCharacterOverview[]>(`${this.apiUrl}/guild-roster`, { withCredentials: true });
  }
}
