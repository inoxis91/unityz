import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HelpApplication, HelpPost } from '../../../services/guild-help';
import { I18nService } from '../../../services/i18n';
import { HelpMemberComponent } from '../help-member/help-member';
import { PostState, categoryEmoji, isFull, remainingSlots } from '../guild-help-utils';

/** Au-delà, la description est repliée derrière « Voir plus ». */
const DESCRIPTION_PREVIEW = 220;

@Component({
  selector: 'app-help-post-card',
  imports: [DatePipe, HelpMemberComponent],
  templateUrl: './help-post-card.html',
  styleUrl: './help-post-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpPostCardComponent {
  protected readonly i18n = inject(I18nService);

  readonly post = input.required<HelpPost>();
  readonly state = input.required<PostState>();
  /** Candidatures en attente, fournies uniquement pour les annonces du membre connecté. */
  readonly applications = input<readonly HelpApplication[]>([]);
  readonly canModerate = input(false);
  /** Liste des candidatures dépliée (onglet « Mes annonces ») ou simple compteur. */
  readonly showApplications = input(false);

  readonly apply = output<HelpPost>();
  readonly withdraw = output<HelpPost>();
  readonly edit = output<HelpPost>();
  readonly close = output<HelpPost>();
  readonly review = output<HelpPost>();
  readonly decide = output<{ application: HelpApplication; decision: 'accept' | 'decline' }>();

  protected readonly expanded = signal(false);

  protected readonly emoji = computed(() => categoryEmoji(this.post().category));
  protected readonly full = computed(() => isFull(this.post()));
  protected readonly slots = computed(() =>
    Array.from({ length: this.post().capacity }, (_, i) => i < this.post().active_pairs),
  );
  protected readonly slotsLabel = computed(() =>
    this.i18n.tf('help.card.slots_label', {
      taken: this.post().active_pairs,
      capacity: this.post().capacity,
      left: remainingSlots(this.post()),
    }),
  );
  protected readonly longDescription = computed(
    () => this.post().description.length > DESCRIPTION_PREVIEW,
  );
  protected readonly description = computed(() => {
    const text = this.post().description;
    return this.longDescription() && !this.expanded()
      ? `${text.slice(0, DESCRIPTION_PREVIEW).trimEnd()}…`
      : text;
  });
}
