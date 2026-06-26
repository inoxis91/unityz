import { Component, Input, Output, EventEmitter, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CalendarService, Signup } from '../../../services/calendar';
import { Character } from '../../../services/character';
import { Roster } from '../../../services/roster';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';
import { CharacterService } from '../../../services/character';

@Component({
  selector: 'app-participants',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './participants.html',
  styleUrl: './participants.css'
})
export class ParticipantsComponent {
  private calendarService = inject(CalendarService);
  private toast = inject(ToastService);
  public i18n = inject(I18nService);

  @Input() event!: any;
  @Input() canManageEvents!: boolean;
  @Input() rioScores!: Map<string, number>;

  @Input() set signups(val: any[]) { this.signupsSig.set(val || []); }
  @Input() set myCharacters(val: any[]) { this.myCharactersSig.set(val || []); }
  @Input() set rosters(val: any[]) { this.rostersSig.set(val || []); }

  @Output() signupChanged = new EventEmitter<void>();
  @Output() openAlts = new EventEmitter<Signup>();

  signupsSig = signal<any[]>([]);
  myCharactersSig = signal<any[]>([]);
  rostersSig = signal<any[]>([]);

  // Sorting
  sortMethod = signal<'date' | 'status'>('date');
  sortDirection = signal<'asc' | 'desc'>('asc');

  // Form Fields
  selectedCharacterId = signal<string>('');
  selectedRole = signal<string>('dps');
  signupStatus = signal<'signed_up' | 'standby' | 'absent'>('signed_up');
  comment = signal<string>('');

  // Computeds
  presentCount = computed(() => this.signupsSig().filter(s => s.status === 'signed_up').length);
  standbyCount = computed(() => this.signupsSig().filter(s => s.status === 'standby').length);
  absentCount = computed(() => this.signupsSig().filter(s => s.status === 'absent').length);

  sortedSignups = computed(() => {
    const list = [...this.signupsSig()];
    const method = this.sortMethod();
    if (method === 'date') {
      const direction = this.sortDirection();
      return list.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.signup_date || a.created_at || 0).getTime() || 0;
        const dateB = new Date(b.updated_at || b.signup_date || b.created_at || 0).getTime() || 0;
        return direction === 'asc' ? dateA - dateB : dateB - dateA;
      });
    } else {
      const order = { 'signed_up': 1, 'standby': 2, 'absent': 3 } as any;
      return list.sort((a, b) => (order[a.status] || 9) - (order[b.status] || 9));
    }
  });

  allowedCharacters = computed(() => {
    return this.myCharactersSig().filter(c => this.isCharacterAllowed(c));
  });

  isSignupDisabled = computed(() => {
    if (!this.event) return true;
    if (this.event.registrations_locked) return true;
    if (this.isEventPast()) return true;
    if (this.signupStatus() === 'absent') return false;
    if (!this.selectedCharacterId()) return true;
    const char = this.myCharactersSig().find(c => c.id === this.selectedCharacterId());
    return !char || !this.isCharacterAllowed(char);
  });

  constructor() {
    effect(() => {
      const allowed = this.allowedCharacters();
      if (allowed.length > 0 && !this.selectedCharacterId() && this.signupStatus() !== 'absent') {
        const mainChar = allowed.find(c => c.is_main);
        if (mainChar) {
          this.selectedCharacterId.set(mainChar.id || '');
        } else {
          this.selectedCharacterId.set(allowed[0].id || '');
        }
        this.onCharacterChange();
      }
    }, { allowSignalWrites: true });
    
    // Auto-load user's existing signup status into the form
    effect(() => {
      const list = this.signupsSig();
      const myId = (this.calendarService as any).authService?.currentUser()?.id;
      const mySignup = list.find(s => s.user_id === myId);
      if (mySignup) {
        this.selectedCharacterId.set(mySignup.character_id || '');
        this.selectedRole.set(mySignup.role);
        this.signupStatus.set(mySignup.status as any);
        this.comment.set(mySignup.comment || '');
      }
    }, { allowSignalWrites: true });
  }

  isEventPast(): boolean {
    if (!this.event) return false;
    const now = new Date();
    const eventDate = new Date(this.event.start_time);
    return eventDate < now;
  }

  isCharacterAllowed(char: Character): boolean {
    if (!this.event || !this.event.roster_id) return true;
    const targetWeight = this.event.roster_weight || 999;
    if (!char.roster_id) return false;
    const charRoster = this.rostersSig().find(r => r.id === char.roster_id);
    return charRoster ? charRoster.weight <= targetWeight : false;
  }

  onCharacterChange() {
    const char = this.myCharactersSig().find(c => c.id === this.selectedCharacterId());
    if (char) {
      if (char.is_tank) this.selectedRole.set('tank');
      else if (char.is_heal) this.selectedRole.set('heal');
      else this.selectedRole.set('dps');
    }
  }

  setStatus(status: 'signed_up' | 'standby' | 'absent') {
    this.signupStatus.set(status);
    if (status !== 'absent' && (!this.selectedCharacterId() || this.selectedCharacterId() === '')) {
      const allowed = this.allowedCharacters();
      const mainChar = allowed.find(c => c.is_main);
      if (mainChar) this.selectedCharacterId.set(mainChar.id || '');
      else if (allowed.length > 0) this.selectedCharacterId.set(allowed[0].id || '');
      this.onCharacterChange();
    }
  }

  onSignup() {
    if (!this.event || this.isSignupDisabled()) return;
    const signupData = {
      character_id: this.signupStatus() === 'absent' ? null : this.selectedCharacterId(),
      role: this.selectedRole(),
      status: this.signupStatus(),
      comment: this.comment()
    };
    this.calendarService.signup(this.event.id, signupData).subscribe({
      next: () => {
        this.signupChanged.emit();
        this.toast.success(this.i18n.t('event.details.toast_signup_success'));
      },
      error: (err) => {
        console.error('Signup error:', err);
        this.toast.error(this.i18n.t('event.details.toast_signup_error'));
      }
    });
  }

  toggleDateSort() {
    if (this.sortMethod() === 'date') {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortMethod.set('date');
      this.sortDirection.set('asc');
    }
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  getRioScoreForKey(name: string | undefined, realm: string | undefined): number | null {
    if (!name || !realm || !this.rioScores) return null;
    return this.rioScores.get(`${name}-${realm}`.toLowerCase()) || null;
  }

  onOpenAltsModal(s: Signup) {
    this.openAlts.emit(s);
  }
}
