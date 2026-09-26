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
import { HttpErrorResponse } from '@angular/common/http';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
  BackofficeService,
  GuildAction,
  GuildDetail,
  PaidTier,
  TimelineItem,
} from '../../../services/backoffice';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import {
  FUNNEL_STAGES,
  STATE_TONE,
  daysLeft,
  formatCents,
  formatDay,
  groupTimeline,
  relativeDay,
  relativeTime,
} from '../backoffice-utils';

type ActionPanel = 'extend' | 'reset' | 'revoke' | null;

const TIMELINE_ICONS: Record<TimelineItem['kind'], string> = {
  event: '•',
  payment: '💶',
  feedback: '💬',
  audit: '🛠️',
  milestone: '🏁',
};

const EVENT_ICONS: Record<string, string> = {
  login_succeeded: '🔑',
  guild_selected: '🏰',
  guild_select_failed: '⛔',
  characters_imported: '🧙',
  payment_viewed: '👀',
  checkout_started: '🛒',
  checkout_canceled: '↩️',
  checkout_expired: '⌛',
  checkout_completed: '💳',
  free_trial_activated: '🎁',
  payment_failed: '⚠️',
  plan_changed: '🔁',
  subscription_past_due: '⏰',
  subscription_cancel_requested: '❌',
  subscription_ended: '👋',
  trial_end_notified: '📨',
  feedback_submitted: '📝',
};

const USAGE_KEYS = [
  'events',
  'signups_30d',
  'rosters',
  'wcl_reports',
  'fee_declarations',
  'craft_requests',
  'help_posts',
  'absences',
  'characters',
];

/**
 * Fiche d'une guilde en panneau latéral (feuille basse sur mobile). Les gestes commerciaux sont
 * appliqués par le serveur sous verrou puis la fiche est rechargée : pas d'état optimiste sur un
 * accès payant.
 */
@Component({
  selector: 'app-bo-guild-drawer',
  templateUrl: './bo-guild-drawer.html',
  styleUrl: './bo-guild-drawer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class BoGuildDrawerComponent {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(BackofficeService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly guildId = input.required<string>();
  readonly closed = output<void>();

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly previousFocus =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  protected readonly data = rxResource({
    params: () => this.guildId(),
    stream: ({ params }) => this.api.guild(params),
  });
  protected readonly guild = computed<GuildDetail | undefined>(() =>
    this.data.hasValue() ? this.data.value() : undefined,
  );

  protected readonly tone = STATE_TONE;
  protected readonly usageKeys = USAGE_KEYS;
  protected readonly panel = signal<ActionPanel>(null);
  protected readonly busy = signal(false);
  protected readonly quickDays = [7, 14, 30, 90];
  protected readonly tiers: PaidTier[] = ['free', 'medium', 'pro'];

  // Formulaires : réinitialisés à chaque (re)chargement de la fiche
  protected readonly days = signal(14);
  protected readonly tier = linkedSignal<PaidTier>(() => {
    const t = this.guild()?.subscription_tier;
    return t === 'medium' || t === 'pro' || t === 'free' ? t : 'pro';
  });
  protected readonly actionNote = signal('');
  protected readonly note = linkedSignal(() => this.guild()?.note.note ?? '');
  protected readonly partner = linkedSignal(() => this.guild()?.note.is_partner ?? false);
  protected readonly noteDirty = computed(() => {
    const g = this.guild();
    return !!g && (this.note() !== g.note.note || this.partner() !== g.note.is_partner);
  });

  protected readonly timeline = computed(() => groupTimeline(this.guild()?.timeline ?? []));
  protected readonly locale = computed(() => this.i18n.currentLocale());
  protected readonly left = computed(() => daysLeft(this.guild()?.subscription_expires_at ?? null));
  protected readonly stageIndex = computed(() => this.guild()?.stage ?? 0);
  protected readonly stages = FUNNEL_STAGES;

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  close() {
    this.closed.emit();
    this.previousFocus?.focus?.();
  }

  protected toggle(panel: ActionPanel) {
    this.panel.update((current) => (current === panel ? null : panel));
    this.actionNote.set('');
  }

  protected euro(cents: number) {
    return formatCents(cents, this.locale());
  }

  protected date(iso: string | null) {
    return iso
      ? formatDay(iso.slice(0, 10), this.locale(), {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';
  }

  protected when(iso: string) {
    return relativeTime(iso, this.locale());
  }

  protected seen(day: string | null) {
    return day
      ? this.i18n.tf('bo.detail.last_seen', { when: relativeDay(day, this.locale()) })
      : this.i18n.t('bo.detail.never_seen');
  }

  protected icon(item: TimelineItem) {
    return item.kind === 'event' ? (EVENT_ICONS[item.type] ?? '•') : TIMELINE_ICONS[item.kind];
  }

  protected label(item: TimelineItem) {
    const key = `bo.tl.${item.type}`;
    const text = this.i18n.t(key);
    return text === key ? item.type : text;
  }

  /** Détail lisible d'une entrée du parcours (offre, montant, motif…). */
  protected detail(item: TimelineItem): string {
    const d = item.data as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof d['amount_cents'] === 'number') parts.push(this.euro(d['amount_cents'] as number));
    if (d['tier']) parts.push(this.i18n.t('bo.tier.' + d['tier']));
    if (d['from'] && d['to'])
      parts.push(`${this.i18n.t('bo.tier.' + d['from'])} → ${this.i18n.t('bo.tier.' + d['to'])}`);
    if (d['reason']) parts.push(this.i18n.t('feedback.reason.' + d['reason']));
    if (d['decline_code']) parts.push(String(d['decline_code']));
    if (d['code']) parts.push(String(d['code']));
    if (typeof d['days'] === 'number')
      parts.push(this.i18n.tf('bo.tl.days', { n: d['days'] as number }));
    if (typeof d['count'] === 'number') parts.push(String(d['count']));
    if (d['can_manage'] === false) parts.push('👤');
    return parts.join(' · ');
  }

  protected comment(item: TimelineItem): string {
    const d = item.data as Record<string, unknown>;
    return String(d['comment'] ?? d['note'] ?? '');
  }

  protected setDays(value: number) {
    this.days.set(Math.min(365, Math.max(1, Math.round(value) || 1)));
  }

  protected async submit(type: GuildAction['type']) {
    const g = this.guild();
    if (!g || this.busy()) return;
    const note = this.actionNote().trim();
    if (note.length < 3) {
      this.toast.error(this.i18n.t('bo.action.note_required'));
      return;
    }

    let action: GuildAction;
    if (type === 'extend_access') {
      action = { type, days: this.days(), tier: this.tier(), note };
    } else {
      const confirmed = await this.confirm.ask(
        this.i18n.t(type === 'revoke_access' ? 'bo.action.revoke' : 'bo.action.reset_trial'),
        this.i18n.tf(
          type === 'revoke_access' ? 'bo.action.revoke_confirm' : 'bo.action.reset_confirm',
          {
            name: g.name,
          },
        ),
        this.i18n.t('bo.action.confirm'),
        this.i18n.t('confirm.cancel'),
        type === 'revoke_access',
      );
      if (!confirmed) return;
      action = { type, note };
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.applyAction(g.id, action));
      this.toast.success(this.i18n.t('bo.action.done'));
      this.panel.set(null);
      this.actionNote.set('');
      this.api.version.update((v) => v + 1);
      this.data.reload();
    } catch (err) {
      this.toast.error(this.i18n.tf('bo.action.error', { message: this.errorMessage(err) }));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveNote() {
    const g = this.guild();
    if (!g || this.busy()) return;
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.saveNote(g.id, this.note().trim(), this.partner()),
      );
      // Mise à jour locale : pas besoin de recharger toute la fiche
      this.data.update((current) =>
        current
          ? {
              ...current,
              is_partner: saved.is_partner,
              note: { ...current.note, ...saved, updated_by: current.note.updated_by },
            }
          : current,
      );
      this.api.version.update((v) => v + 1);
      this.toast.success(this.i18n.t('bo.detail.note_saved'));
    } catch (err) {
      this.toast.error(this.i18n.tf('bo.action.error', { message: this.errorMessage(err) }));
    } finally {
      this.busy.set(false);
    }
  }

  private errorMessage(err: unknown): string {
    const body = err instanceof HttpErrorResponse ? err.error : null;
    const key = body?.code ? `bo.error.${body.code}` : '';
    const translated = key ? this.i18n.t(key) : '';
    return translated && translated !== key
      ? translated
      : (body?.message ?? this.i18n.t('bo.error.load'));
  }
}
