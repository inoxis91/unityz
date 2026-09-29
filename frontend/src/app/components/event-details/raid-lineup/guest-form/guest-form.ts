import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  EventGuest,
  GuestInput,
  GuestKind,
  LineupSelection,
  RaidRole,
} from '../../../../services/calendar';
import { I18nService } from '../../../../services/i18n';
import { WOW_CLASSES, wowClassRoles } from '../../../../constants/wow';
import { CharacterService } from '../../../../services/character';
import {
  fitRoleToClass,
  GUEST_NAME_MAX,
  GUEST_NOTE_MAX,
  isValidGuestName,
  normalizeGuestName,
} from '../guest-utils';

const ROLES: readonly RaidRole[] = ['tank', 'heal', 'dps'];

/** Modale d'ajout / de modification d'un joueur externe (PU, joueur en test). */
@Component({
  selector: 'app-guest-form',
  templateUrl: './guest-form.html',
  styleUrl: './guest-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class GuestFormComponent {
  readonly i18n = inject(I18nService);

  /** null = ajout. */
  readonly guest = input<EventGuest | null>(null);
  readonly saving = input(false);
  /** Clé i18n d'une erreur serveur à afficher sous le pseudo (ex. pseudo déjà pris). */
  readonly nameError = input<string | null>(null);

  readonly submitted = output<GuestInput>();
  readonly closed = output<void>();

  readonly classes = WOW_CLASSES;
  readonly roles = ROLES;
  readonly nameMax = GUEST_NAME_MAX;
  readonly noteMax = GUEST_NOTE_MAX;
  readonly kinds: readonly { value: GuestKind; icon: string }[] = [
    { value: 'pug', icon: '🎯' },
    { value: 'trial', icon: '🧪' },
  ];
  readonly placements: readonly { value: LineupSelection; icon: string; key: string }[] = [
    { value: 'selected', icon: '✓', key: 'event.lineup.stat_selected' },
    { value: null, icon: '⏳', key: 'event.lineup.stat_pending' },
    { value: 'benched', icon: '🪑', key: 'event.lineup.stat_benched' },
  ];

  readonly kind = linkedSignal<GuestKind>(() => this.guest()?.kind ?? 'pug');
  readonly name = linkedSignal(() => this.guest()?.name ?? '');
  readonly className = linkedSignal(() => this.guest()?.class ?? '');
  readonly role = linkedSignal<RaidRole | null>(() => this.guest()?.role ?? null);
  readonly note = linkedSignal(() => this.guest()?.note ?? '');
  /** Un joueur ajouté par le raid lead est le plus souvent attendu : validé par défaut. */
  readonly selection = signal<LineupSelection>('selected');
  private readonly attempted = signal(false);

  readonly isEdit = computed(() => !!this.guest());
  readonly normalizedName = computed(() => normalizeGuestName(this.name()));
  readonly nameInvalid = computed(() => !isValidGuestName(this.normalizedName()));
  readonly playable = computed(() => new Set(wowClassRoles(this.className())));
  readonly valid = computed(() => !this.nameInvalid() && !!this.className() && !!this.role());
  readonly showNameError = computed(
    () => (this.attempted() || this.name().length > 0) && this.nameInvalid(),
  );

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    afterNextRender(() => this.nameInput()?.nativeElement.focus());
  }

  classIcon(name: string): string {
    return CharacterService.getClassIcon(name);
  }

  pickClass(name: string): void {
    this.className.set(name);
    this.role.set(fitRoleToClass(name, this.role()));
  }

  pickRole(role: RaidRole): void {
    if (this.playable().has(role)) this.role.set(role);
  }

  onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  submit(): void {
    this.attempted.set(true);
    const role = this.role();
    if (!this.valid() || !role || this.saving()) return;
    this.submitted.emit({
      name: this.normalizedName(),
      class: this.className(),
      role,
      kind: this.kind(),
      note: this.note().trim() || null,
      selection: this.isEdit() ? this.guest()!.selection : this.selection(),
    });
  }

  close(): void {
    this.closed.emit();
  }
}
