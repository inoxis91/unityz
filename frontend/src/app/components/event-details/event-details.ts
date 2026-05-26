import { Component, OnInit, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { CharacterService, Character } from '../../services/character';
import { RosterService, Roster } from '../../services/roster';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { CLASS_BUFFS, BuffInfo } from '../../constants/wow';

export interface Buff extends BuffInfo {
  present: boolean;
  count: number;
}

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css'
})
export class EventDetailsComponent implements OnInit {
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  
  event = signal<CalendarEvent | null>(null);
  signups = signal<Signup[]>([]);
  myCharacters = signal<Character[]>([]);
  rosters = signal<Roster[]>([]);
  activeTab = signal<'participants' | 'composition'>('participants');
  
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
    roster_id: '' as string | null
  };

  // Computed views
  tanks = computed(() => this.signups().filter(s => s.role === 'tank' && s.status === 'signed_up'));
  heals = computed(() => this.signups().filter(s => s.role === 'heal' && s.status === 'signed_up'));
  dps = computed(() => this.signups().filter(s => s.role === 'dps' && s.status === 'signed_up'));
  absents = computed(() => this.signups().filter(s => s.status === 'absent'));

  buffs = computed(() => {
    const activeSignups = this.signups().filter(s => s.status === 'signed_up');
    
    return CLASS_BUFFS.map(baseBuff => {
      const allowedClasses = baseBuff.classes;
      const count = activeSignups.filter(s => allowedClasses.includes(s.character_class || '')).length;
      return {
        ...baseBuff,
        present: count > 0,
        count: count
      } as Buff;
    });
  });

  canManageEvents = computed(() => this.authService.canManageEvents());

  allowedCharacters = computed(() => {
    return this.myCharacters().filter(c => this.isCharacterAllowed(c));
  });

  isCharacterAllowed(char: Character): boolean {
    const evt = this.event();
    if (!evt || !evt.roster_id) return true; // No restriction

    const targetWeight = evt.roster_weight || 999;
    if (!char.roster_id) return false;
    
    const charRoster = this.rosters().find(r => r.id === char.roster_id);
    return charRoster ? charRoster.weight <= targetWeight : false;
  }

  constructor(
    private route: ActivatedRoute,
    private calendarService: CalendarService,
    private characterService: CharacterService,
    public rosterService: RosterService,
    public authService: AuthService,
    private toast: ToastService
  ) {
    // Effect to auto-select a character when the list of allowed characters is loaded or changed
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
      
      // Pre-fill form if user is already signed up
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
    this.characterService.getMyCharacters().subscribe(chars => {
      this.myCharacters.set(chars);
    });
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
      type: ['raid', 'mm+'].includes(evt.type) ? evt.type : 'custom',
      customType: ['raid', 'mm+'].includes(evt.type) ? '' : evt.type,
      roster_id: evt.roster_id || ''
    };
    this.showEditModal.set(true);
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
      roster_id: this.editEventData.roster_id || null
    };

    this.calendarService.updateEvent(this.event()!.id!, updatedData).subscribe({
      next: () => {
        this.loadEvent(this.event()!.id!);
        this.showEditModal.set(false);
        this.toast.success('Événement mis à jour.');
      },
      error: () => this.toast.error('Erreur lors de la mise à jour.')
    });
  }

  async onDeleteEvent() {
    const ok = await this.confirm.ask(
      'Supprimer l\'événement',
      'Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible.'
    );

    if (ok && this.event()) {
      this.calendarService.deleteEvent(this.event()!.id!).subscribe({
        next: () => {
          this.toast.success('Événement supprimé.');
          this.router.navigate(['/calendar']);
        },
        error: () => this.toast.error('Erreur lors de la suppression.')
      });
    }
  }

  onCharacterChange() {
    const char = this.myCharacters().find(c => c.id === this.selectedCharacterId);
    if (char) {
      if (char.is_tank) {
        this.selectedRole = 'tank';
      } else if (char.is_heal) {
        this.selectedRole = 'heal';
      } else if (char.is_dps) {
        this.selectedRole = 'dps';
      } else {
        this.selectedRole = 'dps';
      }
    }
  }

  setStatus(status: 'signed_up' | 'standby' | 'absent') {
    this.signupStatus = status;
    
    // Auto-reselect Main character if we switch back from absent to a presence status
    if (status !== 'absent' && (!this.selectedCharacterId || this.selectedCharacterId === '')) {
      const allowed = this.allowedCharacters();
      const mainChar = allowed.find(c => c.is_main);
      if (mainChar) {
        this.selectedCharacterId = mainChar.id || '';
      } else if (allowed.length > 0) {
        this.selectedCharacterId = allowed[0].id || '';
      }
      this.onCharacterChange();
    }
  }

  onSignup() {
    if (!this.event()) return;
    
    const signupData = {
      character_id: this.signupStatus === 'absent' ? null : this.selectedCharacterId,
      role: this.selectedRole,
      status: this.signupStatus,
      comment: this.comment
    };

    this.calendarService.signup(this.event()!.id!, signupData).subscribe({
      next: () => {
        this.loadSignups(this.event()!.id!);
        this.toast.success('Votre choix a été enregistré !');
      },
      error: (err) => {
        console.error('Signup error:', err);
        this.toast.error('Erreur lors de l\'enregistrement de votre choix.');
      }
    });
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
