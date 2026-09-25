import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, defer, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export type HelpKind = 'request' | 'offer';
export type HelpCategory = 'mplus' | 'raid' | 'class' | 'gear' | 'professions' | 'gold' | 'other';
export type HelpRole = 'tank' | 'heal' | 'dps';
export type HelpApplicationStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export interface HelpPost {
  id: string;
  kind: HelpKind;
  category: HelpCategory;
  target_role: HelpRole | null;
  title: string;
  description: string;
  capacity: number;
  created_at: string;
  author_user_id: string;
  author_battletag: string;
  author_character_id: string | null;
  author_character_name: string | null;
  author_character_class: string | null;
  active_pairs: number;
  pending_count: number;
  my_application_status: HelpApplicationStatus | null;
}

export interface HelpApplication {
  id: string;
  post_id: string;
  user_id: string;
  battletag: string;
  character_name: string | null;
  character_class: string | null;
  message: string;
  created_at: string;
}

export interface HelpPair {
  id: string;
  post_id: string | null;
  post_title: string | null;
  category: HelpCategory;
  started_at: string;
  helper_user_id: string;
  helper_battletag: string;
  helper_character_name: string | null;
  helper_character_class: string | null;
  helped_user_id: string;
  helped_battletag: string;
  helped_character_name: string | null;
  helped_character_class: string | null;
  partner_discord_id: string | null;
}

export interface HelpOverview {
  posts: HelpPost[];
  applications: HelpApplication[];
  pairs: HelpPair[];
}

export interface HelpPostInput {
  characterId: string | null;
  category: HelpCategory;
  targetRole: HelpRole | null;
  title: string;
  description: string;
  capacity: number;
}

const EMPTY: HelpOverview = { posts: [], applications: [], pairs: [] };

/**
 * État de l'entraide de la guilde active. Les actions sont optimistes : l'état change tout de
 * suite, et en cas d'erreur l'instantané précédent est restauré puis resynchronisé avec l'API.
 */
@Injectable({ providedIn: 'root' })
export class GuildHelpService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/guild-help`;
  private readonly options = { withCredentials: true };

  readonly overview = signal<HelpOverview>(EMPTY);
  readonly loaded = signal(false);

  load(): Observable<HelpOverview> {
    return this.http.get<HelpOverview>(this.apiUrl, this.options).pipe(
      tap((overview) => {
        this.overview.set(overview);
        this.loaded.set(true);
      }),
    );
  }

  /** Resynchronisation silencieuse (retour sur l'onglet, après une action serveur). */
  refresh(): void {
    this.load().subscribe({ error: (err) => console.error('[GuildHelp] Refresh failed', err) });
  }

  createPost(kind: HelpKind, input: HelpPostInput): Observable<HelpPost> {
    return this.http
      .post<HelpPost>(`${this.apiUrl}/posts`, { kind, ...input }, this.options)
      .pipe(tap((post) => this.overview.update((o) => ({ ...o, posts: [post, ...o.posts] }))));
  }

  updatePost(id: string, input: HelpPostInput): Observable<HelpPost> {
    return this.http
      .put<HelpPost>(`${this.apiUrl}/posts/${id}`, input, this.options)
      .pipe(
        tap((post) => this.overview.update((o) => ({ ...o, posts: replacePost(o.posts, post) }))),
      );
  }

  closePost(id: string): Observable<void> {
    return this.optimistic(
      (o) => ({
        ...o,
        posts: o.posts.filter((p) => p.id !== id),
        applications: o.applications.filter((a) => a.post_id !== id),
      }),
      this.http.post<void>(`${this.apiUrl}/posts/${id}/close`, {}, this.options),
    );
  }

  apply(postId: string, characterId: string | null, message: string): Observable<void> {
    return this.optimistic(
      (o) => ({
        ...o,
        posts: updatePost(o.posts, postId, (p) => ({
          ...p,
          my_application_status: 'pending',
          pending_count: p.pending_count + 1,
        })),
      }),
      this.http.post<void>(
        `${this.apiUrl}/posts/${postId}/applications`,
        { characterId, message },
        this.options,
      ),
    );
  }

  withdraw(postId: string): Observable<void> {
    return this.optimistic(
      (o) => ({
        ...o,
        posts: updatePost(o.posts, postId, (p) => ({
          ...p,
          my_application_status: 'withdrawn',
          pending_count: Math.max(0, p.pending_count - 1),
        })),
      }),
      this.http.delete<void>(`${this.apiUrl}/posts/${postId}/applications/me`, this.options),
    );
  }

  /** Accepter crée le binôme côté serveur : l'état est rechargé pour l'afficher. */
  decide(application: HelpApplication, decision: 'accept' | 'decline'): Observable<void> {
    const accepted = decision === 'accept';
    return this.optimistic(
      (o) => ({
        ...o,
        applications: o.applications.filter((a) => a.id !== application.id),
        posts: updatePost(o.posts, application.post_id, (p) => ({
          ...p,
          pending_count: Math.max(0, p.pending_count - 1),
          active_pairs: p.active_pairs + (accepted ? 1 : 0),
        })),
      }),
      this.http.post<void>(
        `${this.apiUrl}/applications/${application.id}/decision`,
        { decision },
        this.options,
      ),
    ).pipe(tap(() => accepted && this.refresh()));
  }

  endPair(pair: HelpPair): Observable<void> {
    return this.optimistic(
      (o) => ({
        ...o,
        pairs: o.pairs.filter((p) => p.id !== pair.id),
        posts: pair.post_id
          ? updatePost(o.posts, pair.post_id, (p) => ({
              ...p,
              active_pairs: Math.max(0, p.active_pairs - 1),
            }))
          : o.posts,
      }),
      this.http.post<void>(`${this.apiUrl}/pairs/${pair.id}/end`, {}, this.options),
    );
  }

  private optimistic(
    update: (o: HelpOverview) => HelpOverview,
    request$: Observable<void>,
  ): Observable<void> {
    return defer(() => {
      const snapshot = this.overview();
      this.overview.set(update(snapshot));
      return request$.pipe(
        catchError((err) => {
          this.overview.set(snapshot);
          this.refresh();
          return throwError(() => err);
        }),
      );
    });
  }
}

function updatePost(posts: HelpPost[], id: string, fn: (p: HelpPost) => HelpPost): HelpPost[] {
  return posts.map((p) => (p.id === id ? fn(p) : p));
}

function replacePost(posts: HelpPost[], post: HelpPost): HelpPost[] {
  return posts.map((p) => (p.id === post.id ? post : p));
}
