import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  CdkDragDrop, 
  moveItemInArray, 
  transferArrayItem, 
  CdkDrag, 
  CdkDropList,
  DragDropModule 
} from '@angular/cdk/drag-drop';
import { RosterService, Roster } from '../../../services/roster';
import { CharacterService, Character } from '../../../services/character';

@Component({
  selector: 'app-admin-rosters',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './admin-rosters.html',
  styleUrl: './admin-rosters.css'
})
export class AdminRostersComponent implements OnInit {
  showCreateModal = signal(false);
  newRoster = { name: '', description: '' };
  
  // Modal for editing
  showEditModal = signal(false);
  editingRoster: Roster | null = null;

  constructor(public rosterService: RosterService) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.rosterService.loadRosters().subscribe();
    this.rosterService.loadUnassignedCharacters().subscribe();
  }

  drop(event: CdkDragDrop<Character[]>, rosterId: string | null) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const character = event.previousContainer.data[event.previousIndex];
      
      // Optimistic UI update
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Backend call
      this.rosterService.assignCharacter(character.id || '', rosterId).subscribe({
        error: (err) => {
          console.error('Failed to assign character:', err);
          this.loadAll(); // Rollback on error
        }
      });
    }
  }

  onCreateRoster() {
    if (!this.newRoster.name) return;
    this.rosterService.createRoster(this.newRoster).subscribe(() => {
      this.closeModal();
    });
  }

  onUpdateRoster() {
    if (!this.editingRoster || !this.editingRoster.name) return;
    this.rosterService.updateRoster(this.editingRoster.id, {
      name: this.editingRoster.name,
      description: this.editingRoster.description
    }).subscribe(() => {
      this.closeEditModal();
    });
  }

  onDeleteRoster(id: string) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce roster ? Les personnages seront désassignés.')) {
      this.rosterService.deleteRoster(id).subscribe();
    }
  }

  openEditModal(roster: Roster) {
    this.editingRoster = { ...roster };
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editingRoster = null;
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.newRoster = { name: '', description: '' };
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
