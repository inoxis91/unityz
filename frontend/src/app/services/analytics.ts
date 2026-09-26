import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export const FEEDBACK_REASONS = [
  'too_expensive',
  'testing_first',
  'not_decision_maker',
  'missing_feature',
  'guild_inactive',
  'other_tool',
  'technical_issue',
  'other',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];
export type FeedbackSource = 'payment_exit' | 'trial_end' | 'cancel';

export interface FeedbackAnswer {
  reason: FeedbackReason;
  comment: string;
}

/**
 * Signaux du parcours de souscription envoyés au back-office. Le serveur déduit la guilde et les
 * droits de la session ; un échec de suivi ne gêne jamais l'utilisateur.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/analytics`;

  track(name: 'payment_viewed' | 'checkout_canceled', tier?: 'medium' | 'pro') {
    this.http
      .post(`${this.api}/events`, { name, ...(tier ? { tier } : {}) }, { withCredentials: true })
      .subscribe({ error: () => undefined });
  }

  sendFeedback(
    source: Exclude<FeedbackSource, 'cancel'>,
    answer: FeedbackAnswer,
  ): Observable<unknown> {
    return this.http.post(`${this.api}/feedback`, { source, ...answer }, { withCredentials: true });
  }
}
