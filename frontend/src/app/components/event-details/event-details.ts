import { Component, OnInit, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { 
  CdkDragDrop, 
  moveItemInArray, 
  transferArrayItem, 
  DragDropModule 
} from '@angular/cdk/drag-drop';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { CharacterService, Character } from '../../services/character';
import { RosterService, Roster } from '../../services/roster';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { I18nService } from '../../services/i18n';
import { CLASS_BUFFS, BuffInfo } from '../../constants/wow';

export interface Buff extends BuffInfo {
  present: boolean;
  count: number;
}

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DragDropModule],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css'
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
  activeTab = signal<'participants' | 'composition'>('participants');
  
  // Sorting for participants tab
  sortMethod = signal<'date' | 'status'>('date');

  // Alts View
  showAltsModal = signal(false);
  selectedSignup = signal<Signup | null>(null);

  // Cancellation Modal
  showCancelModal = signal(false);
  cancelReason = '';

  // Signup Form
  selectedCharacterId = '';
  selectedRole = 'dps';
  signupStatus: 'signed_up' | 'standby' | 'absent' = 'signed_up';
  comment = '';

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
    mm_groups_count: 0
  };

  // Computed views for Raid
  tanks = computed(() => this.signups().filter(s => s.role === 'tank' && s.status === 'signed_up'));
  heals = computed(() => this.signups().filter(s => s.role === 'heal' && s.status === 'signed_up'));
  dps = computed(() => this.signups().filter(s => s.role === 'dps' && s.status === 'signed_up'));
  absents = computed(() => this.signups().filter(s => s.status === 'absent'));

  presentCount = computed(() => this.signups().filter(s => s.status === 'signed_up').length);
  standbyCount = computed(() => this.signups().filter(s => s.status === 'standby').length);
  absentCount = computed(() => this.signups().filter(s => s.status === 'absent').length);

  // Sorted list for Participants tab
  sortedSignups = computed(() => {
    const list = [...this.signups()];
    const method = this.sortMethod();

    if (method === 'date') {
      return list.sort((a, b) => {
        const dateA = new Date(a.signup_date || a.created_at || 0).getTime();
        const dateB = new Date(b.signup_date || b.created_at || 0).getTime();
        return dateA - dateB;
      });
    } else {
      const statusWeight: { [key: string]: number } = { 'signed_up': 1, 'standby': 2, 'absent': 3 };
      return list.sort((a, b) => {
        const weightA = statusWeight[a.status] || 99;
        const weightB = statusWeight[b.status] || 99;
        if (weightA !== weightB) return weightA - weightB;
        return new Date(a.signup_date || a.created_at || 0).getTime() - new Date(b.signup_date || b.created_at || 0).getTime();
      });
    }
  });

  // Computed views for MM+
  unassignedMembers = computed(() => this.signups().filter(s => s.status === 'signed_up' && (s.group_index === 0 || !s.group_index)));
  
  mmGroups = computed(() => {
    const count = this.event()?.mm_groups_count || 0;
    const groups = [];
    for (let i = 1; i <= count; i++) {
      const members = this.signups().filter(s => s.group_index === i);
      groups.push({
        index: i,
        members: members,
        tanks: members.filter(m => m.role === 'tank'),
        heals: members.filter(m => m.role === 'heal'),
        dps: members.filter(m => m.role === 'dps'),
        buffs: this.calculateBuffs(members)
      });
    }
    return groups;
  });

  buffs = computed(() => {
    const activeSignups = this.signups().filter(s => s.status === 'signed_up');
    return this.calculateBuffs(activeSignups);
  });

  calculateBuffs(members: Signup[]): Buff[] {
    return CLASS_BUFFS.map(baseBuff => {
      const count = members.filter(s => baseBuff.classes.includes(s.character_class || '')).length;
      return {
        ...baseBuff,
        present: count > 0,
        count: count
      } as Buff;
    });
  }

  canManageEvents = computed(() => this.authService.canManageEvents());

  allowedCharacters = computed(() => {
    return this.myCharacters().filter(c => this.isCharacterAllowed(c));
  });

  isSignupDisabled = computed(() => {
    if (!this.event()) return true;
    if (this.signupStatus === 'absent') return false;
    if (!this.selectedCharacterId) return true;
    const char = this.myCharacters().find(c => c.id === this.selectedCharacterId);
    return !char || !this.isCharacterAllowed(char);
  });

  isCharacterAllowed(char: Character): boolean {
    const evt = this.event();
    if (!evt || !evt.roster_id) return true;
    const targetWeight = evt.roster_weight || 999;
    if (!char.roster_id) return false;
    const charRoster = this.rosters().find(r => r.id === char.roster_id);
    return charRoster ? charRoster.weight <= targetWeight : false;
  }

  constructor(
    private route: ActivatedRoute,
    private calendarService: CalendarService,
    public characterService: CharacterService,
    public rosterService: RosterService,
    public authService: AuthService,
    private toast: ToastService
  ) {
    effect(() => {
      const allowed = this.allowedCharacters();
      if (allowed.length > 0 && !this.selectedCharacterId && this.signupStatus !== 'absent') {
        const mainChar = allowed.find(c => c.is_main);
        if (mainChar) {
          this.selectedCharacterId = mainChar.id || '';
        } else {
          this.selectedCharacterId = allowed[0].id || '';
        }
        this.onCharacterChange();
      }
    });
  }

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

      const mySignup = signups.find(s => s.user_id === this.authService.currentUser()?.id);
      if (mySignup) {
        this.selectedCharacterId = mySignup.character_id || '';
        this.selectedRole = mySignup.role;
        this.signupStatus = mySignup.status as any;
        this.comment = mySignup.comment || '';
      }
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
      mm_groups_count: evt.mm_groups_count || 0
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
      mm_groups_count: this.editEventData.mm_groups_count
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

  onCharacterChange() {
    const char = this.myCharacters().find(c => c.id === this.selectedCharacterId);
    if (char) {
      if (char.is_tank) this.selectedRole = 'tank';
      else if (char.is_heal) this.selectedRole = 'heal';
      else this.selectedRole = 'dps';
    }
  }

  setStatus(status: 'signed_up' | 'standby' | 'absent') {
    this.signupStatus = status;
    if (status !== 'absent' && (!this.selectedCharacterId || this.selectedCharacterId === '')) {
      const allowed = this.allowedCharacters();
      const mainChar = allowed.find(c => c.is_main);
      if (mainChar) this.selectedCharacterId = mainChar.id || '';
      else if (allowed.length > 0) this.selectedCharacterId = allowed[0].id || '';
      this.onCharacterChange();
    }
  }

  onSignup() {
    if (!this.event() || this.isSignupDisabled()) return;
    const signupData = {
      character_id: this.signupStatus === 'absent' ? null : this.selectedCharacterId,
      role: this.selectedRole,
      status: this.signupStatus,
      comment: this.comment
    };
    this.calendarService.signup(this.event()!.id!, signupData).subscribe({
      next: () => {
        this.loadSignups(this.event()!.id!);
        this.toast.success(this.i18n.t('event.details.toast_signup_success'));
      },
      error: (err) => {
        console.error('Signup error:', err);
        this.toast.error(this.i18n.t('event.details.toast_signup_error'));
      }
    });
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

  // MM+ Group Management
  onAddGroup() {
    const evt = this.event();
    if (!evt || !evt.id) return;
    const newCount = (evt.mm_groups_count || 0) + 1;
    this.calendarService.updateGroupsCount(evt.id, newCount).subscribe(() => {
      this.loadEvent(evt.id!);
    });
  }

  onRemoveGroup(index: number) {
    const evt = this.event();
    if (!evt || !evt.id) return;
    
    // 1. Move all members of this group back to unassigned (index 0)
    const membersInGroup = this.signups().filter(s => s.group_index === index);
    const movePromises = membersInGroup.map(m => 
      this.calendarService.updateSignupGroup(evt.id!, m.user_id, 0).toPromise()
    );

    Promise.all(movePromises).then(() => {
      // 2. Decrement group count
      const newCount = Math.max(0, (evt.mm_groups_count || 0) - 1);
      this.calendarService.updateGroupsCount(evt.id!, newCount).subscribe(() => {
        this.loadEvent(evt.id!);
        this.loadSignups(evt.id!); // Refresh members positions
      });
    });
  }

  dropToGroup(event: CdkDragDrop<Signup[]>, groupIndex: number) {
    if (event.previousContainer === event.container) return;
    const member = event.previousContainer.data[event.previousIndex];
    const evt = this.event();
    if (!evt || !evt.id || !member) return;

    // Optimistic UI update
    const currentSignups = this.signups();
    const updatedSignups = currentSignups.map(s => 
      s.user_id === member.user_id ? { ...s, group_index: groupIndex } : s
    );
    this.signups.set(updatedSignups);

    // Backend update
    this.calendarService.updateSignupGroup(evt.id, member.user_id, groupIndex).subscribe({
      error: () => {
        this.toast.error(this.i18n.t('event.details.toast_move_error'));
        this.loadSignups(evt.id!);
      }
    });
  }
}
