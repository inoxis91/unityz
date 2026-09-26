import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export type GuildState =
  | 'paying'
  | 'canceling'
  | 'past_due'
  | 'comped'
  | 'trial'
  | 'lapsed'
  | 'prospect';

export type FunnelStage =
  | 'created'
  | 'manager_joined'
  | 'payment_viewed'
  | 'offer_activated'
  | 'engaged'
  | 'paid'
  | 'retained';

export type PaidTier = 'free' | 'medium' | 'pro';
export type Period = 7 | 30 | 90 | 365;

export interface SeriesPoint {
  day: string;
  [metric: string]: string | number;
}

export interface Overview {
  days: number;
  guilds: {
    total: number;
    byState: Record<GuildState, number>;
    byTier: Record<'free' | 'medium' | 'pro', number>;
    paying: number;
  };
  users: { total: number };
  mrr_cents: number;
  arpu_cents: number;
  period: {
    new_users: number;
    new_users_prev: number;
    new_guilds: number;
    new_guilds_prev: number;
    revenue_cents: number;
    revenue_prev_cents: number;
    new_subscriptions: number;
    churned: number;
  };
  revenue_total_cents: number;
  activity: { dau: number; wau: number; mau: number; active_guilds_7d: number };
  trial_conversion: number | null;
  tracking_since: string | null;
  series: SeriesPoint[];
  recent: {
    type: string;
    at: string;
    data: Record<string, unknown>;
    guild_id: string;
    guild_name: string;
  }[];
}

export interface FunnelStep {
  key: string;
  reached: number;
  stopped?: number;
}

export interface Funnel {
  days: number | null;
  region: string | null;
  guilds: (FunnelStep & { key: FunnelStage; stopped: number })[];
  users: FunnelStep[];
  logins: { started: number; succeeded: number; signups: number; failed: number };
}

export interface Usage {
  series: { day: string; active_users: number; active_guilds: number }[];
  adoption: { guilds: number; features: { key: string; guilds: number; share: number | null }[] };
  cohorts: { week: string; users: number; retention: (number | null)[] }[];
  top_guilds: {
    id: string;
    name: string;
    realm: string;
    region: string;
    active_users: number;
    active_days: number;
  }[];
}

export interface Reasons {
  days: number;
  feedback: { source: string; reason: string; count: number }[];
  comments: {
    id: string;
    source: string;
    reason: string;
    comment: string;
    created_at: string;
    guild_id: string | null;
    guild_name: string | null;
    battletag: string | null;
  }[];
  login_failures: { reason: string; count: number }[];
  guild_select_failures: { code: string; count: number }[];
  no_guild_found: number;
  blocked_not_manager: number;
  checkout: {
    started: number;
    completed: number;
    canceled: number;
    expired: number;
    abandon_rate: number | null;
  };
  payment_failures: { code: string; count: number }[];
  past_due: number;
  ended: number;
}

export interface Health {
  integrations: { key: string; ok: boolean; detail: string | null }[];
  cron: {
    job: string;
    last_run_at: string | null;
    last_status: 'ok' | 'error' | null;
    last_error: string | null;
    runs: number;
  }[];
  database: {
    size_bytes: number;
    sessions: number;
    analytics_events: number;
    tracking_since: string | null;
  };
  process: { uptime_s: number; rss_bytes: number; node: string };
}

export interface GuildRow {
  id: string;
  name: string;
  realm: string;
  region: string;
  subscription_tier: string;
  subscription_expires_at: string | null;
  created_at: string;
  state: GuildState;
  stage: number;
  members: number;
  managers: number;
  active_users_7d: number;
  last_active_on: string | null;
  events_30d: number;
  paid_total_cents: number;
  mrr_cents: number;
  is_partner: boolean;
}

export interface Page<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface GuildFilters {
  search?: string;
  state?: GuildState | '';
  stage?: number | null;
  region?: string;
  partner?: boolean;
  sort: 'created' | 'name' | 'activity' | 'members' | 'revenue';
  page: number;
}

export interface TimelineItem {
  kind: 'event' | 'payment' | 'feedback' | 'audit' | 'milestone';
  type: string;
  at: string;
  battletag: string | null;
  data: Record<string, unknown>;
}

export interface GuildDetail extends GuildRow {
  subscription_status: string | null;
  free_trial_used_at: string | null;
  payments_count: number;
  stage_key: FunnelStage;
  blizzard_id: number;
  discord_enabled: boolean;
  discord_linked: boolean;
  fees_enabled: boolean;
  stripe_managed: boolean;
  stripe_customer_url: string | null;
  stripe_subscription_url: string | null;
  note: { note: string; is_partner: boolean; updated_at: string | null; updated_by: string | null };
  roster: {
    id: string;
    battletag: string;
    role: string;
    rank: number | null;
    joined_at: string;
    discord_linked: boolean;
    last_active_on: string | null;
    main_name: string | null;
    main_class: string | null;
  }[];
  usage: Record<string, number>;
  timeline: TimelineItem[];
}

export type GuildAction =
  | { type: 'extend_access'; days: number; tier: PaidTier; note: string }
  | { type: 'reset_trial'; note: string }
  | { type: 'revoke_access'; note: string };

export interface AuditEntry {
  id: string;
  created_at: string;
  actor_battletag: string;
  action: string;
  guild_id: string | null;
  guild_name: string | null;
  details: Record<string, unknown>;
}

/**
 * API du back-office plateforme (/api/platform). Une session Battle.net trop ancienne répond
 * 401 PLATFORM_REAUTH_REQUIRED : `reauthRequired` passe à true et l'écran propose de se reconnecter.
 */
@Injectable({ providedIn: 'root' })
export class BackofficeService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/platform`;
  private readonly options = { withCredentials: true };

  readonly reauthRequired = signal(false);
  /** Incrémenté après une action : les écrans qui en dépendent se rechargent. */
  readonly version = signal(0);

  overview(days: Period): Observable<Overview> {
    return this.get('overview', { days });
  }

  funnel(days: Period | 'all', region: string): Observable<Funnel> {
    return this.get('funnel', { days, ...(region ? { region } : {}) });
  }

  usage(): Observable<Usage> {
    return this.get('usage');
  }

  reasons(days: Period): Observable<Reasons> {
    return this.get('reasons', { days });
  }

  health(): Observable<Health> {
    return this.get('health');
  }

  guilds(filters: GuildFilters): Observable<Page<GuildRow>> {
    return this.get('guilds', { ...guildParams(filters), page: filters.page });
  }

  /** URL de l'export CSV des guildes filtrées (téléchargée par le navigateur, cookie de session inclus). */
  exportUrl(filters: GuildFilters): string {
    const params = new HttpParams({ fromObject: guildParams(filters) });
    return `${this.api}/guilds/export?${params.toString()}`;
  }

  guild(id: string): Observable<GuildDetail> {
    return this.get(`guilds/${encodeURIComponent(id)}`);
  }

  applyAction(id: string, action: GuildAction): Observable<unknown> {
    return this.http
      .post(`${this.api}/guilds/${encodeURIComponent(id)}/actions`, action, this.options)
      .pipe(catchError((err) => this.handle(err)));
  }

  saveNote(id: string, note: string, isPartner: boolean): Observable<GuildDetail['note']> {
    return this.http
      .put<
        GuildDetail['note']
      >(`${this.api}/guilds/${encodeURIComponent(id)}/note`, { note, is_partner: isPartner }, this.options)
      .pipe(catchError((err) => this.handle(err)));
  }

  audit(page: number): Observable<Page<AuditEntry>> {
    return this.get('audit', { page });
  }

  private get<T>(path: string, params: Record<string, string | number | boolean> = {}) {
    return this.http
      .get<T>(`${this.api}/${path}`, { ...this.options, params })
      .pipe(catchError((err) => this.handle(err)));
  }

  private handle(err: HttpErrorResponse) {
    if (err.status === 401 && err.error?.code === 'PLATFORM_REAUTH_REQUIRED') {
      this.reauthRequired.set(true);
    }
    return throwError(() => err);
  }
}

function guildParams(filters: GuildFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = { sort: filters.sort };
  if (filters.search?.trim()) params['search'] = filters.search.trim();
  if (filters.state) params['state'] = filters.state;
  if (filters.stage !== null && filters.stage !== undefined) params['stage'] = filters.stage;
  if (filters.region) params['region'] = filters.region;
  if (filters.partner) params['partner'] = true;
  return params;
}
