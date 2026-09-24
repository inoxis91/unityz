import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CraftRequest, CraftService } from '../../services/craft';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header';
import { CRAFT_SLOTS, countByType, slotEmoji, typeLabelKey, typesForSlot } from './crafts-utils';

type Scope = 'all' | 'mine';

@Component({
  selector: 'app-crafts',
  imports: [DatePipe, PageHeaderComponent],
  templateUrl: './crafts.html',
  styleUrl: './crafts.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CraftsComponent {
  readonly craftService = inject(CraftService);
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly slots = CRAFT_SLOTS;
  readonly slotEmoji = slotEmoji;

  readonly loaded = signal(false);
  readonly selectedSlot = signal('');
  readonly selectedType = signal('');
  readonly isSaving = signal(false);
  /** Demandes retirées de façon optimiste pendant l'appel API. */
  readonly completing = signal<ReadonlySet<string>>(new Set());

  readonly scope = signal<Scope>('all');
  readonly typeFilter = signal<string | null>(null);

  private readonly userId = computed(() => this.auth.currentUser()?.id);
  readonly availableTypes = computed(() => typesForSlot(this.selectedSlot()));

  private readonly visibleRequests = computed(() => {
    const hidden = this.completing();
    return this.craftService.pendingRequests().filter((r) => !hidden.has(r.id));
  });

  readonly mineCount = computed(
    () => this.visibleRequests().filter((r) => r.user_id === this.userId()).length,
  );

  readonly typeCounts = computed(() => [...countByType(this.visibleRequests()).entries()]);

  readonly requests = computed(() => {
    const type = this.typeFilter();
    const mine = this.scope() === 'mine';
    return this.visibleRequests().filter(
      (r) => (!type || r.armor_type === type) && (!mine || r.user_id === this.userId()),
    );
  });

  constructor() {
    this.craftService.loadPendingRequests().subscribe({
      next: () => this.loaded.set(true),
      error: (err) => {
        this.loaded.set(true);
        console.error('[Crafts] Error loading craft requests', err);
      },
    });
  }

  slotLabel(slot: string): string {
    return this.i18n.t(`crafts.slots.${slot}`);
  }

  typeLabel(type: string): string {
    return this.i18n.t(typeLabelKey(type));
  }

  isMine(req: CraftRequest): boolean {
    return req.user_id === this.userId();
  }

  selectSlot(slot: string) {
    this.selectedSlot.set(slot);
    if (!this.availableTypes().includes(this.selectedType())) this.selectedType.set('');
  }

  toggleTypeFilter(type: string) {
    this.typeFilter.set(this.typeFilter() === type ? null : type);
  }

  onSubmitRequest() {
    const slot = this.selectedSlot();
    const type = this.selectedType();
    if (!slot || !type) {
      this.toast.error(this.i18n.t('crafts.toast.validation_error'));
      return;
    }

    this.isSaving.set(true);
    this.craftService.createRequest(slot, type).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('crafts.toast.create_success'));
        this.selectedSlot.set('');
        this.selectedType.set('');
        this.isSaving.set(false);
      },
      error: (err) => {
        console.error('[Crafts] Error creating craft request', err);
        this.toast.error(this.i18n.t('crafts.toast.create_error'));
        this.isSaving.set(false);
      },
    });
  }

  async onCompleteRequest(req: CraftRequest) {
    const ok = await this.confirm.ask(
      this.i18n.t('crafts.confirm_title'),
      this.i18n
        .t('crafts.confirm_desc')
        .replace('{item}', `${this.slotLabel(req.slot)} (${this.typeLabel(req.armor_type)})`)
        .replace('{name}', req.main_character_name || req.battletag || ''),
    );
    if (!ok) return;

    // Retrait optimiste : la carte disparaît tout de suite, réaffichée si l'API échoue
    this.completing.update((set) => new Set(set).add(req.id));
    this.craftService.completeRequest(req.id).subscribe({
      next: () => this.toast.success(this.i18n.t('crafts.toast.complete_success')),
      error: (err) => {
        console.error('[Crafts] Error completing craft request', err);
        this.completing.update((set) => {
          const next = new Set(set);
          next.delete(req.id);
          return next;
        });
        this.toast.error(this.i18n.t('crafts.toast.complete_error'));
      },
    });
  }
}
