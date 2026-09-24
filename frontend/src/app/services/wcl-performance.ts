import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Contrat de `GET /api/characters/:id/wcl/*` (voir backend `wclCharacterService.ts`). */

export type WclMetric = 'dps' | 'hps';
export type WclSource = 'wcl' | 'mock';

export interface LocalizedName {
  en: string;
  fr: string;
}

export interface WclZoneInfo {
  id: number;
  name: LocalizedName;
  imageUrl: string;
}

export interface WclSpecRanking {
  spec: string;
  points: number;
  possiblePoints: number | null;
  rank: number;
  regionRank: number;
  serverRank: number;
  rankPercent: number;
  total: number;
}

export interface WclEncounterRanking {
  points: number;
  rank: number;
  regionRank: number;
  serverRank: number;
  rankPercent: number;
  total: number;
}

export interface RaidEncounterPerformance {
  id: number;
  name: LocalizedName;
  iconUrl: string;
  kills: number;
  bestPercent: number | null;
  medianPercent: number | null;
  bestAmount: number | null;
  fastestKillMs: number | null;
  spec: string | null;
  itemLevel: number | null;
  lockedIn: boolean;
  allStars: WclEncounterRanking | null;
}

export interface RaidZonePerformance {
  zone: WclZoneInfo;
  difficulty: number | null;
  bestAverage: number | null;
  medianAverage: number | null;
  killsLogged: number;
  bossesKilled: number;
  bossCount: number;
  allStars: WclSpecRanking[];
  encounters: RaidEncounterPerformance[];
}

export interface RaidPerformance {
  source: WclSource;
  metric: WclMetric;
  spec: string | null;
  zones: RaidZonePerformance[];
}

export interface DungeonPerformance {
  id: number;
  name: LocalizedName;
  iconUrl: string;
  runs: number;
  keyLevel: number | null;
  timeMs: number | null;
  points: number | null;
  spec: string | null;
  ranking: WclEncounterRanking | null;
  throughput: {
    amount: number;
    keyLevel: number;
    bestPercent: number | null;
    medianPercent: number | null;
  } | null;
}

export interface MythicPlusPerformance {
  source: WclSource;
  metric: WclMetric;
  zone: WclZoneInfo;
  score: number | null;
  specs: WclSpecRanking[];
  throughputBestAverage: number | null;
  throughputMedianAverage: number | null;
  runs: number;
  dungeons: DungeonPerformance[];
}

export interface RaidPerformanceQuery {
  /** Absent : la plus haute difficulté avec des kills. */
  difficulty: number | null;
  metric: WclMetric;
  spec: string | null;
}

@Injectable({ providedIn: 'root' })
export class WclPerformanceService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/characters`;

  getRaid(characterId: string, query: RaidPerformanceQuery): Observable<RaidPerformance> {
    let params = new HttpParams().set('metric', query.metric);
    if (query.difficulty) params = params.set('difficulty', query.difficulty);
    if (query.spec) params = params.set('spec', query.spec);
    return this.http.get<RaidPerformance>(`${this.apiUrl}/${characterId}/wcl/raid`, {
      params,
      withCredentials: true,
    });
  }

  getMythicPlus(characterId: string, metric: WclMetric): Observable<MythicPlusPerformance> {
    return this.http.get<MythicPlusPerformance>(`${this.apiUrl}/${characterId}/wcl/mythic-plus`, {
      params: { metric },
      withCredentials: true,
    });
  }
}
