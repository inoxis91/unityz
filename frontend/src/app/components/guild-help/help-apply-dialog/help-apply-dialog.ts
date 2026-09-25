import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CharacterService } from '../../../services/character';
import { HelpPost } from '../../../services/guild-help';
import { I18nService } from '../../../services/i18n';
import { HelpMemberComponent } from '../help-member/help-member';
import { categoryEmoji } from '../guild-help-utils';

const MESSAGE_MAX = 300;

export interface HelpApplyRequest {
  post: HelpPost;
  characterId: string | null;
  message: string;
}

/** Réponse à une annonce : personnage et mot pour l'auteur. L'envoi est géré par la page. */
@Component({
  selector: 'app-help-apply-dialog',
  imports: [HelpMemberComponent],
  templateUrl: './help-apply-dialog.html',
  styleUrl: './help-apply-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class HelpApplyDialogComponent {
  protected readonly i18n = inject(I18nService);

  readonly post = input.required<HelpPost>();
  readonly closed = output<void>();
  readonly submitted = output<HelpApplyRequest>();

  protected readonly messageMax = MESSAGE_MAX;
  protected readonly characters = toSignal(
    inject(CharacterService)
      .getMyCharacters()
      .pipe(catchError(() => of([]))),
  );
  protected readonly characterId = signal<string | null>(null);
  protected readonly message = signal('');
  protected readonly emoji = computed(() => categoryEmoji(this.post().category));

  private readonly messageInput = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

  constructor() {
    afterNextRender(() => this.messageInput()?.nativeElement.focus({ preventScroll: true }));
  }

  submit(): void {
    this.submitted.emit({
      post: this.post(),
      characterId: this.characterId(),
      message: this.message().trim(),
    });
  }
}
