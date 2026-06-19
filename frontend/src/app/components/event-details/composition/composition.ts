import { Component, Input, Output, EventEmitter, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  CdkDragDrop, 
  moveItemInArray, 
  transferArrayItem, 
  DragDropModule 
} from '@angular/cdk/drag-drop';
import { CalendarService, Signup } from '../../../services/calendar';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';
import { CLASS_BUFFS, BuffInfo } from '../../../constants/wow';
import { CharacterService } from '../../../services/character';

export interface Buff extends BuffInfo {
  present: boolean;
  count: number;
}

@Component({
  selector: 'app-composition',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './composition.html',
  styleUrl: './composition.css'
})
export class CompositionComponent {
  private calendarService = inject(CalendarService);
  private toast = inject(ToastService);
  public i18n = inject(I18nService);

  @Input() event!: any;
  @Input() canManageEvents!: boolean;
  @Input() rioScores!: Map<string, number>;

  @Input() set signups(val: any[]) { this.signupsSig.set(val || []); }
  @Output() openAlts = new EventEmitter<any>();
  @Output() compositionChanged = new EventEmitter<void>();

  signupsSig = signal<any[]>([]);

  // Computed views for Raid
  tanks = computed(() => this.signupsSig().filter(s => s.role === 'tank' && s.status === 'signed_up'));
  heals = computed(() => this.signupsSig().filter(s => s.role === 'heal' && s.status === 'signed_up'));
  dps = computed(() => this.signupsSig().filter(s => s.role === 'dps' && s.status === 'signed_up'));

  // Computed views for MM+
  unassignedMembers = computed(() => this.signupsSig().filter(s => s.status === 'signed_up' && (s.group_index === 0 || !s.group_index)));
  
  mmGroups = computed(() => {
    const count = this.event?.mm_groups_count || 0;
    const groups = [];
    for (let i = 1; i <= count; i++) {
      const members = this.signupsSig().filter(s => s.group_index === i);
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
    const activeSignups = this.signupsSig().filter(s => s.status === 'signed_up');
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

  // MM+ Group Management
  onAddGroup() {
    if (!this.event || !this.event.id) return;
    const newCount = (this.event.mm_groups_count || 0) + 1;
    this.calendarService.updateGroupsCount(this.event.id, newCount).subscribe(() => {
      this.compositionChanged.emit();
    });
  }

  onRemoveGroup(index: number) {
    if (!this.event || !this.event.id) return;
    
    // 1. Move all members of this group back to unassigned (index 0)
    const membersInGroup = this.signupsSig().filter(s => s.group_index === index);
    const movePromises = membersInGroup.map(m => 
      this.calendarService.updateSignupGroup(this.event.id!, m.user_id, 0).toPromise()
    );

    Promise.all(movePromises).then(() => {
      // 2. Decrement group count
      const newCount = Math.max(0, (this.event.mm_groups_count || 0) - 1);
      this.calendarService.updateGroupsCount(this.event.id!, newCount).subscribe(() => {
        this.compositionChanged.emit();
      });
    });
  }

  dropToGroup(event: CdkDragDrop<Signup[]>, groupIndex: number) {
    if (event.previousContainer === event.container) return;
    const member = event.previousContainer.data[event.previousIndex];
    if (!this.event || !this.event.id || !member) return;

    // Optimistic UI update
    const currentSignups = this.signupsSig();
    const updatedSignups = currentSignups.map(s => 
      s.user_id === member.user_id ? { ...s, group_index: groupIndex } : s
    );
    this.signupsSig.set(updatedSignups);

    // Backend update
    this.calendarService.updateSignupGroup(this.event.id, member.user_id, groupIndex).subscribe({
      next: () => {
        this.compositionChanged.emit();
      },
      error: () => {
        this.toast.error(this.i18n.t('event.details.toast_move_error'));
        this.compositionChanged.emit();
      }
    });
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
