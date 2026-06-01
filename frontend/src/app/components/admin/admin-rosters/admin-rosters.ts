import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
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
import { ConfirmService } from '../../../services/confirm';
import { ToastService } from '../../../services/toast';
import { AuthService } from '../../../services/auth';

@Component({
  selector: 'app-admin-rosters',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, RouterModule],
  templateUrl: './admin-rosters.html',
  styleUrl: './admin-rosters.css'
})
export class AdminRostersComponent implements OnInit {
  showCreateModal = signal(false);
  newRoster = { name: '', description: '', weight: 1 };
  
  // Modal for editing
  showEditModal = signal(false);
  editingRoster: Roster | null = null;

  public authService = inject(AuthService);
  isPro = computed(() => this.authService.currentUser()?.subscription_tier === 'pro');
  limitReached = computed(() => !this.isPro() && this.rosterService.rosters().length >= 2);

  constructor(
    public rosterService: RosterService,
    public characterService: CharacterService,
    private confirm: ConfirmService,
    private toast: ToastService
  ) {}

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
          this.toast.error('Erreur lors de l\'assignation.');
          this.loadAll(); // Rollback on error
        }
      });
    }
  }

  onCreateRoster() {
    if (!this.newRoster.name) return;
    this.rosterService.createRoster(this.newRoster).subscribe({
        next: () => {
            this.toast.success('Roster créé avec succès.');
            this.closeModal();
        },
        error: () => this.toast.error('Erreur lors de la création.')
    });
  }

  onUpdateRoster() {
    if (!this.editingRoster || !this.editingRoster.name) return;
    this.rosterService.updateRoster(this.editingRoster.id, {
      name: this.editingRoster.name,
      description: this.editingRoster.description,
      weight: this.editingRoster.weight
    }).subscribe({
        next: () => {
            this.toast.success('Roster mis à jour.');
            this.closeEditModal();
        },
        error: () => this.toast.error('Erreur lors de la mise à jour.')
    });
  }

  async onDeleteRoster(id: string) {
    const ok = await this.confirm.ask(
        'Supprimer le roster',
        'Êtes-vous sûr de vouloir supprimer ce roster ? Les personnages seront désassignés.'
    );

    if (ok) {
      this.rosterService.deleteRoster(id).subscribe({
        next: () => this.toast.success('Roster supprimé.'),
        error: () => this.toast.error('Erreur lors de la suppression.')
      });
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
    this.newRoster = { name: '', description: '', weight: 1 };
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
