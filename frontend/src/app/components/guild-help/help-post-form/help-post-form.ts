import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CharacterService } from '../../../services/character';
import {
  GuildHelpService,
  HelpCategory,
  HelpKind,
  HelpPost,
  HelpRole,
} from '../../../services/guild-help';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import {
  DEFAULT_CAPACITY,
  HELP_CATEGORIES,
  HELP_KIND_EMOJI,
  HELP_ROLES,
  MAX_CAPACITY,
  helpErrorKey,
} from '../guild-help-utils';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 1000;
const TITLE_MIN = 3;

/** Création ou modification (si `post` est fourni) d'une annonce d'entraide. */
@Component({
  selector: 'app-help-post-form',
  templateUrl: './help-post-form.html',
  styleUrl: './help-post-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class HelpPostFormComponent {
  protected readonly i18n = inject(I18nService);
  private readonly helpService = inject(GuildHelpService);
  private readonly toast = inject(ToastService);

  readonly post = input<HelpPost | null>(null);
  readonly initialKind = input<HelpKind>('request');
  readonly closed = output<void>();

  protected readonly kinds: readonly HelpKind[] = ['request', 'offer'];
  protected readonly categories = HELP_CATEGORIES;
  protected readonly roles = HELP_ROLES;
  protected readonly kindEmoji = HELP_KIND_EMOJI;
  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly maxCapacity = MAX_CAPACITY;

  protected readonly characters = toSignal(
    inject(CharacterService)
      .getMyCharacters()
      .pipe(catchError(() => of([]))),
  );

  protected readonly isEdit = computed(() => !!this.post());
  protected readonly kind = linkedSignal(() => this.post()?.kind ?? this.initialKind());
  protected readonly category = linkedSignal<HelpCategory | null>(
    () => this.post()?.category ?? null,
  );
  protected readonly role = linkedSignal<HelpRole | null>(() => this.post()?.target_role ?? null);
  protected readonly title = linkedSignal(() => this.post()?.title ?? '');
  protected readonly description = linkedSignal(() => this.post()?.description ?? '');
  protected readonly capacity = linkedSignal(
    () => this.post()?.capacity ?? DEFAULT_CAPACITY[this.kind()],
  );
  /** Personnage choisi ; null = main (résolu côté serveur). */
  protected readonly characterId = linkedSignal<string | null>(
    () => this.post()?.author_character_id ?? null,
  );
  protected readonly saving = signal(false);

  protected readonly valid = computed(
    () => !!this.category() && this.title().trim().length >= TITLE_MIN,
  );

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    afterNextRender(() => this.titleInput()?.nativeElement.focus({ preventScroll: true }));
  }

  setCapacity(value: number): void {
    this.capacity.set(Math.min(MAX_CAPACITY, Math.max(1, value)));
  }

  submit(): void {
    const category = this.category();
    if (!this.valid() || !category || this.saving()) return;

    const input = {
      characterId: this.characterId(),
      category,
      targetRole: this.role(),
      title: this.title().trim(),
      description: this.description().trim(),
      capacity: this.capacity(),
    };
    const existing = this.post();
    const request$ = existing
      ? this.helpService.updatePost(existing.id, input)
      : this.helpService.createPost(this.kind(), input);

    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.toast.success(
          this.i18n.t(existing ? 'help.toast.updated' : `help.toast.created_${this.kind()}`),
        );
        this.closed.emit();
      },
      error: (err) => {
        console.error('[GuildHelp] Error saving post', err);
        this.saving.set(false);
        this.toast.error(this.i18n.t(helpErrorKey(err, 'help.toast.save_error')));
      },
    });
  }
}
