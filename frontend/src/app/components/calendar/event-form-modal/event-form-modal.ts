import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarEvent } from '../../../services/calendar';
import { I18nService } from '../../../services/i18n';
import { RosterService } from '../../../services/roster';
import { eventTypeKey } from '../../../utils/event-type';
import {
  EventForm,
  INVITABLE_GROUPS,
  buildEventPayload,
  emptyEventForm,
  formFromEvent,
  toggleInvitedGroup,
} from '../calendar-utils';

/**
 * Formulaire de création / modification d'un événement (calendrier et page de l'événement).
 * Le parent appelle l'API : la modale émet le corps prêt à envoyer.
 */
@Component({
  selector: 'app-event-form-modal',
  imports: [FormsModule],
  templateUrl: './event-form-modal.html',
  styleUrl: './event-form-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class EventFormModalComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly rosterService = inject(RosterService);

  /** Événement à modifier ; null pour une création. */
  readonly event = input<CalendarEvent | null>(null);
  /** Date (YYYY-MM-DD) proposée pour une création. */
  readonly date = input('');
  readonly saving = input(false);

  readonly submitted = output<CalendarEvent>();
  readonly closed = output<void>();

  readonly groups = INVITABLE_GROUPS;
  readonly eventTypes = [
    { value: 'raid', tone: 'raid', emoji: '⚔️', label: 'calendar.form.type_raid' },
    { value: 'mm+', tone: 'mm', emoji: '🗝️', label: 'calendar.form.type_mm' },
    { value: 'reunion', tone: 'reunion', emoji: '💬', label: 'calendar.form.type_reunion' },
    { value: 'custom', tone: 'custom', emoji: '✨', label: 'calendar.form.type_custom' },
  ] as const;

  /** Modèle template-driven : ngModel écrit directement dedans. */
  form: EventForm = emptyEventForm();

  ngOnInit() {
    const event = this.event();
    this.form = event ? formFromEvent(event) : emptyEventForm(this.date());
    if (!this.rosterService.rosters().length) this.rosterService.loadRosters().subscribe();
  }

  formTone() {
    return this.form.type === 'custom' ? 'custom' : eventTypeKey(this.form.type);
  }

  groupLabel(group: string): string {
    return this.i18n.t(`calendar.form.role_${group}`);
  }

  isGroupChecked(group: string): boolean {
    return this.form.invited_groups.includes(group);
  }

  toggleGroup(group: string) {
    this.form.invited_groups = toggleInvitedGroup(this.form.invited_groups, group);
  }

  submit() {
    if (!this.saving()) this.submitted.emit(buildEventPayload(this.form));
  }
}
