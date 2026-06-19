import { Component, OnInit, signal, computed, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { CharacterService, Character } from '../../services/character';
import { RosterService, Roster } from '../../services/roster';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { I18nService } from '../../services/i18n';
import { ParticipantsComponent } from './participants/participants';
import { CompositionComponent } from './composition/composition';
import { LogsDashboardComponent } from './logs-dashboard/logs-dashboard';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LogsDashboardComponent, ParticipantsComponent, CompositionComponent],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css',
  encapsulation: ViewEncapsulation.None
})
export class EventDetailsComponent implements OnInit {
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  public i18n = inject(I18nService);
  
  event = signal<CalendarEvent | null>(null);
  signups = signal<Signup[]>([]);
  rioScores = signal<Map<string, number>>(new Map());
  myCharacters = signal<Character[]>([]);
  rosters = signal<Roster[]>([]);
  // Warcraft Logs Dashboard state is now encapsulated inside LogsDashboardComponent
  activeTab = signal<'participants' | 'composition' | 'logs'>('participants');
  
  // Alts View
  showAltsModal = signal(false);
  selectedSignup = signal<Signup | null>(null);

  // Cancellation Modal
  showCancelModal = signal(false);
  cancelReason = '';

  isEventPast = computed(() => {
    const evt = this.event();
    if (!evt) return false;
    return new Date().getTime() > new Date(evt.start_time).getTime();
  });

  // Edit Event Modal
  showEditModal = signal(false);
  editEventData = {
    title: '',
    description: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    type: '',
    customType: '',
    roster_id: '' as string | null,
    invited_groups: [] as string[],
    mm_groups_count: 0,
    logs: ''
  };

  canManageEvents = computed(() => this.authService.canManageEvents());

  constructor(
    private route: ActivatedRoute,
    private calendarService: CalendarService,
    public characterService: CharacterService,
    public rosterService: RosterService,
    public authService: AuthService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.activeTab.set('participants');
        this.loadEvent(id);
        this.loadSignups(id);
      }
    });
    this.loadMyCharacters();
    this.rosterService.loadRosters().subscribe(rosters => this.rosters.set(rosters));
  }

  loadEvent(id: string) {
    this.calendarService.getEvent(id).subscribe((event: CalendarEvent) => {
      this.event.set(event);
    });
  }

  loadSignups(id: string) {
    this.calendarService.getSignups(id).subscribe(signups => {
      this.signups.set(signups);

      // Fetch RIO scores for everyone
      signups.forEach(s => {
        const name = s.character_name || s.main_character_name;
        const realm = s.character_realm || s.main_character_realm;
        if (name && realm) {
          this.characterService.getRioScore(name, realm).subscribe(score => {
            this.rioScores.update(map => {
              const newMap = new Map(map);
              newMap.set(`${name}-${realm}`.toLowerCase(), score);
              return newMap;
            });
          });
        }
      });
    });
  }

  loadMyCharacters() {
    this.characterService.getMyCharacters().subscribe(chars => this.myCharacters.set(chars));
  }

  openEditModal() {
    const evt = this.event();
    if (!evt) return;
    this.editEventData = {
      title: evt.title,
      description: evt.description || '',
      start_date: evt.start_time.split('T')[0],
      start_time: evt.start_time.split('T')[1].substring(0, 5),
      end_date: evt.end_time.split('T')[0],
      end_time: evt.end_time.split('T')[1].substring(0, 5),
      type: ['raid', 'mm+', 'reunion'].includes(evt.type) ? evt.type : 'custom',
      customType: ['raid', 'mm+', 'reunion'].includes(evt.type) ? '' : evt.type,
      roster_id: evt.roster_id || '',
      invited_groups: evt.invited_groups || [],
      mm_groups_count: evt.mm_groups_count || 0,
      logs: evt.logs || ''
    };
    this.showEditModal.set(true);
  }

  isGroupChecked(group: string): boolean {
    return this.editEventData.invited_groups?.includes(group) || false;
  }

  toggleGroup(group: string) {
    if (!this.editEventData.invited_groups) {
      this.editEventData.invited_groups = [];
    }
    
    if (group === 'all') {
      if (this.isGroupChecked('all')) {
        this.editEventData.invited_groups = [];
      } else {
        this.editEventData.invited_groups = ['all'];
      }
    } else {
      if (this.isGroupChecked(group)) {
        this.editEventData.invited_groups = this.editEventData.invited_groups.filter(g => g !== group);
      } else {
        this.editEventData.invited_groups = [...this.editEventData.invited_groups, group];
      }
    }
  }

  getInvitedGroupsLabel(invitedGroups: string[] | undefined): string {
    if (!invitedGroups || invitedGroups.length === 0) return '';
    return invitedGroups.map(g => {
      if (g === 'admin') return this.i18n.t('calendar.form.role_admin');
      if (g === 'raid_leader') return this.i18n.t('calendar.form.role_raid_leader');
      if (g === 'treasurer') return this.i18n.t('calendar.form.role_treasurer');
      if (g === 'event_manager') return this.i18n.t('calendar.form.role_event_manager');
      return g;
    }).join(', ');
  }

  onUpdateEvent() {
    if (!this.event()) return;
    const finalType = this.editEventData.type === 'custom' ? this.editEventData.customType : this.editEventData.type;
    const updatedData: CalendarEvent = {
      id: this.event()!.id,
      title: this.editEventData.title,
      description: this.editEventData.description,
      start_time: `${this.editEventData.start_date}T${this.editEventData.start_time}:00`,
      end_time: `${this.editEventData.end_date}T${this.editEventData.end_time}:00`,
      type: finalType,
      roster_id: finalType === 'reunion' ? null : (this.editEventData.roster_id || null),
      invited_groups: finalType === 'reunion' ? (this.editEventData.invited_groups || []) : [],
      mm_groups_count: this.editEventData.mm_groups_count,
      logs: finalType === 'raid' ? (this.editEventData.logs || null) : null
    };
    this.calendarService.updateEvent(this.event()!.id!, updatedData).subscribe({
      next: () => {
        this.loadEvent(this.event()!.id!);
        this.showEditModal.set(false);
        this.toast.success(this.i18n.t('event.details.toast_update_success'));
      },
      error: () => this.toast.error(this.i18n.t('event.details.toast_update_error'))
    });
  }

  async onDeleteEvent() {
    const ok = await this.confirm.ask(
      this.i18n.t('event.details.confirm_delete_title'),
      this.i18n.t('event.details.confirm_delete_desc')
    );
    if (ok && this.event()) {
      this.calendarService.deleteEvent(this.event()!.id!).subscribe({
        next: () => {
          this.toast.success(this.i18n.t('event.details.toast_delete_success'));
          this.router.navigate(['/calendar']);
        },
        error: () => this.toast.error(this.i18n.t('event.details.toast_delete_error'))
      });
    }
  }

  onCancelEvent() {
    const evt = this.event();
    if (!evt) return;

    this.cancelReason = '';
    this.showCancelModal.set(true);
  }

  confirmCancelEvent() {
    const evt = this.event();
    if (!evt) return;

    this.calendarService.cancelEvent(evt.id!, this.cancelReason).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('event.details.toast_cancel_success'));
        this.loadEvent(evt.id!);
        this.showCancelModal.set(false);
      },
      error: () => this.toast.error(this.i18n.t('event.details.toast_cancel_error'))
    });
  }

  async onRemindEvent() {
    const evt = this.event();
    if (!evt) return;

    const ok = await this.confirm.ask(
      this.i18n.t('event.details.confirm_remind_title'),
      this.i18n.t('event.details.confirm_remind_desc').replace('{eventTitle}', evt.title)
    );

    if (ok) {
      this.calendarService.remindEvent(evt.id!).subscribe({
        next: () => this.toast.success(this.i18n.t('event.details.toast_remind_success')),
        error: () => this.toast.error(this.i18n.t('event.details.toast_remind_error'))
      });
    }
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  getRioScoreForKey(name: string | undefined, realm: string | undefined): number | null {
    if (!name || !realm) return null;
    return this.rioScores().get(`${name}-${realm}`.toLowerCase()) || null;
  }

  openAltsModal(signup: Signup) {
    this.selectedSignup.set(signup);
    this.showAltsModal.set(true);
  }

  isSelectedCharacterAndRole(characterId: string, role: string): boolean {
    const signup = this.selectedSignup();
    return signup ? (signup.character_id === characterId && signup.role === role) : false;
  }

  onAdminUpdateSignup(characterId: string, role: string) {
    const signup = this.selectedSignup();
    const evt = this.event();
    if (!signup || !evt || !evt.id) return;

    this.calendarService.updateSignup(evt.id, signup.user_id, {
      character_id: characterId,
      role: role
    }).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('event.details.toast_signup_updated_success'));
        this.showAltsModal.set(false);
        this.loadEvent(evt.id!);
        this.loadSignups(evt.id!);
      },
      error: (err) => {
        console.error('Admin update signup error:', err);
        this.toast.error(this.i18n.t('event.details.toast_signup_updated_error'));
      }
    });
  }

  onReloadSignups() {
    const evt = this.event();
    if (evt && evt.id) {
      this.loadSignups(evt.id);
      this.loadEvent(evt.id);
    }
  }

  onOpenAltsModal(signup: Signup) {
    this.selectedSignup.set(signup);
    this.showAltsModal.set(true);
  }
}
