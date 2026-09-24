import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Contrat de `GET /api/events/:id/logs-analysis` (voir backend `wclReportService.ts`). */

export type RaidLogRole = 'tank' | 'healer' | 'dps';

export interface MvpBreakdown {
  performance: number;
  output: number;
  survival: number;
  preparation: number;
  utility: number;
}

export type MvpCriterion = keyof MvpBreakdown;

export const MVP_CRITERIA: readonly MvpCriterion[] = [
  'performance',
  'output',
  'survival',
  'preparation',
  'utility',
];

export interface ReportDeath {
  actorId: number;
  timeMs: number;
  ability: string | null;
  abilityIcon: string | null;
  premature: boolean;
}

export interface ReportPullPlayer {
  actorId: number;
  role: RaidLogRole;
  spec: string | null;
  dps: number;
  hps: number;
  activeTime: number;
  parse: number | null;
  ilvlParse: number | null;
  died: boolean;
  prematureDeath: boolean;
  combatPotions: number;
  healthstones: number;
  healthstoneBeforeDeath: boolean;
  flask: boolean;
  food: boolean;
}

export interface ReportPull {
  id: number;
  encounterId: number;
  name: string;
  difficulty: number;
  kill: boolean;
  bossPercent: number;
  durationMs: number;
  offsetMs: number;
  size: number;
  itemLevel: number | null;
  raidDps: number;
  raidHps: number;
  deaths: ReportDeath[];
  players: ReportPullPlayer[];
}

export interface ReportEncounter {
  id: number;
  name: string;
  difficulty: number;
  iconUrl: string;
  pullIds: number[];
  kill: boolean;
  bestPercent: number;
  killDurationMs: number | null;
}

export interface ReportPlayer {
  actorId: number;
  name: string;
  server: string;
  classId: string;
  spec: string | null;
  role: RaidLogRole;
  itemLevel: number | null;
  pulls: number;
  kills: number;
  avgParse: number | null;
  bestParse: number | null;
  avgIlvlParse: number | null;
  damageDone: number;
  healingDone: number;
  dps: number;
  hps: number;
  deaths: number;
  prematureDeaths: number;
  combatPotions: number;
  potionPulls: number;
  potionEligiblePulls: number;
  flaskPulls: number;
  foodPulls: number;
  healthstones: number;
  deathsWithoutHealthstone: number;
  interrupts: number;
  dispels: number;
  score: number;
  breakdown: MvpBreakdown;
  eligible: boolean;
  rank: number;
}

export interface RaidLogsAnalysis {
  report: {
    code: string;
    url: string;
    title: string;
    owner: string | null;
    zone: { id: number; name: string; imageUrl: string } | null;
    startTime: number;
    endTime: number;
  };
  summary: {
    difficulty: number | null;
    pulls: number;
    kills: number;
    wipes: number;
    encounters: number;
    bossesKilled: number;
    combatTimeMs: number;
    elapsedMs: number;
    deaths: number;
    prematureDeaths: number;
    itemLevel: number | null;
    avgParse: number | null;
    potionRate: number | null;
    raidDps: number;
    raidHps: number;
  };
  encounters: ReportEncounter[];
  pulls: ReportPull[];
  players: ReportPlayer[];
  mvpActorId: number | null;
  scoring: {
    weights: MvpBreakdown;
    minAttendance: number;
    deathPenalty: number;
    wipeCutoffRatio: number;
    potionMinPullMs: number;
  };
  rankingsPending: boolean;
  generatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RaidLogsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/events`;

  getAnalysis(eventId: string, locale: 'fr' | 'en'): Observable<RaidLogsAnalysis> {
    return this.http.get<RaidLogsAnalysis>(`${this.apiUrl}/${eventId}/logs-analysis`, {
      params: new HttpParams().set('locale', locale),
      withCredentials: true,
    });
  }
}
