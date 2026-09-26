import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FEEDBACK_REASONS,
  FeedbackAnswer,
  FeedbackReason,
  FeedbackSource,
} from '../../services/analytics';
import { I18nService } from '../../services/i18n';

const REASON_ICONS: Record<FeedbackReason, string> = {
  too_expensive: '💸',
  testing_first: '🧪',
  not_decision_maker: '🙋',
  missing_feature: '🧩',
  guild_inactive: '💤',
  other_tool: '🔀',
  technical_issue: '🐞',
  other: '✏️',
};

/**
 * Questionnaire « pourquoi ne pas souscrire / résilier ». Présentationnel : le parent envoie la
 * réponse (feedback analytique ou résiliation Stripe) et pilote `busy`.
 */
@Component({
  selector: 'app-feedback-survey',
  templateUrl: './feedback-survey.html',
  styleUrl: './feedback-survey.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'dismiss()' },
})
export class FeedbackSurveyComponent {
  protected readonly i18n = inject(I18nService);

  readonly source = input.required<FeedbackSource>();
  readonly busy = input(false);
  readonly submitted = output<FeedbackAnswer>();
  readonly dismissed = output<void>();

  protected readonly reasons = FEEDBACK_REASONS.map((key) => ({ key, icon: REASON_ICONS[key] }));
  protected readonly reason = signal<FeedbackReason | null>(null);
  protected readonly comment = signal('');
  protected readonly showError = signal(false);

  private readonly firstOption = viewChild<ElementRef<HTMLInputElement>>('firstOption');

  constructor() {
    afterNextRender(() => this.firstOption()?.nativeElement.focus());
  }

  protected pick(reason: FeedbackReason) {
    this.reason.set(reason);
    this.showError.set(false);
  }

  protected submit() {
    const reason = this.reason();
    if (!reason) {
      this.showError.set(true);
      return;
    }
    this.submitted.emit({ reason, comment: this.comment().trim() });
  }

  dismiss() {
    if (!this.busy()) this.dismissed.emit();
  }
}
