import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarService, CalendarEvent, Signup } from '../../services/calendar';
import { AuthService } from '../../services/auth';
import { CharacterService, Character } from '../../services/character';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css'
})
export class EventDetailsComponent implements OnInit {
  event = signal<CalendarEvent | null>(null);
  signups = signal<Signup[]>([]);
  myCharacters = signal<Character[]>([]);
  activeTab = signal<'participants' | 'composition'>('participants');
  
  // Signup Form
  selectedCharacterId = '';
  selectedRole = 'dps';
  comment = '';
  signupStatus: 'signed_up' | 'standby' | 'absent' = 'signed_up';

  isAdmin = computed(() => this.authService.currentUser()?.is_admin === true);

  // Computed Composition
  tanks = computed(() => this.signups().filter(s => s.role === 'tank' && s.status !== 'absent'));
  heals = computed(() => this.signups().filter(s => s.role === 'heal' && s.status !== 'absent'));
  dps = computed(() => this.signups().filter(s => s.role === 'dps' && s.status !== 'absent'));
  absents = computed(() => this.signups().filter(s => s.status === 'absent'));

  constructor(
    private route: ActivatedRoute,
    private calendarService: CalendarService,
    public authService: AuthService,
    private characterService: CharacterService
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
  }

  loadEvent(id: string) {
    this.calendarService.getEvent(id).subscribe({
      next: (event) => this.event.set(event),
      error: (err) => console.error('Error loading event:', err)
    });
  }

  loadSignups(id: string) {
    this.calendarService.getSignups(id).subscribe(signups => {
      this.signups.set(signups);
      // Pre-fill if user already signed up
      const mySignup = signups.find(s => s.user_id === this.authService.currentUser()?.id);
      if (mySignup) {
        this.selectedCharacterId = mySignup.character_id || '';
        this.selectedRole = mySignup.role;
        this.comment = mySignup.comment || '';
        this.signupStatus = (mySignup.status as any) || 'signed_up';
      }
    });
  }

  loadMyCharacters() {
    this.characterService.getMyCharacters().subscribe(chars => {
      this.myCharacters.set(chars);
      // Auto-select Main character if not already signed up with one
      if (!this.selectedCharacterId) {
        const mainChar = chars.find(c => c.is_main);
        if (mainChar) {
          this.selectedCharacterId = mainChar.id || '';
        } else if (chars.length > 0) {
          this.selectedCharacterId = chars[0].id || '';
        }
        this.onCharacterChange();
      }
    });
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
      const mainChar = this.myCharacters().find(c => c.is_main);
      if (mainChar) {
        this.selectedCharacterId = mainChar.id || '';
      } else if (this.myCharacters().length > 0) {
        this.selectedCharacterId = this.myCharacters()[0].id || '';
      }
      this.onCharacterChange();
    }
  }

  onSignup() {
    if (!this.event()) return;
    
    let charId: string | null = this.selectedCharacterId;
    
    if (this.signupStatus === 'absent') {
      charId = null;
    } else if (!charId) {
      alert('Veuillez sélectionner un personnage pour vous inscrire.');
      return;
    }

    this.calendarService.signup(this.event()!.id!, {
      character_id: charId as any,
      role: this.selectedRole as any,
      comment: this.comment,
      status: this.signupStatus
    }).subscribe({
      next: () => {
        this.loadSignups(this.event()!.id!);
      },
      error: (err) => {
        console.error('Signup error:', err);
        alert('Erreur lors de l\'enregistrement de votre choix.');
      }
    });
  }

  getClassCategory(className: string | undefined): string {
    if (!className) return 'unknown';
    return className.toLowerCase().replace(/\s+/g, '-');
  }
}
