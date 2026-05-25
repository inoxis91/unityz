import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CharacterService, Character } from '../../services/character';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-character-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-manager.html',
  styleUrl: './character-manager.css'
})
export class CharacterManagerComponent implements OnInit {
  bnetCharacters = signal<Character[]>([]);
  myCharacters = signal<Character[]>([]);
  loadingBnet = signal<boolean>(false);

  constructor(
    private characterService: CharacterService,
    private authService: AuthService,
    private confirm: ConfirmService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadMyCharacters();
    this.fetchBnetCharacters();
  }


  loadMyCharacters() {
    this.characterService.getMyCharacters().subscribe({
      next: (chars) => {
        this.myCharacters.set(chars);
      },
      error: (err) => console.error('Error loading my characters', err)
    });
  }

  fetchBnetCharacters() {
    this.loadingBnet.set(true);
    this.characterService.getBnetCharacters().subscribe({
      next: (chars) => {
        // Filtrer les persos déjà importés
        const currentMyChars = this.myCharacters();
        const filtered = chars.filter(bc => 
          !currentMyChars.some(mc => mc.name === bc.name && mc.realm === bc.realm)
        );
        this.bnetCharacters.set(filtered);
        this.loadingBnet.set(false);
      },
      error: (err) => {
        console.error('Error fetching Bnet characters', err);
        this.loadingBnet.set(false);
      }
    });
  }

  importCharacter(char: Character) {
    this.characterService.importCharacters([char]).subscribe({
      next: () => {
        this.loadMyCharacters();
        this.toast.success(`${char.name} a été ajouté à votre liste.`);
        this.bnetCharacters.set(this.bnetCharacters().filter(c => c !== char));
      },
      error: (err) => {
        console.error('Error importing character', err);
        this.toast.error('Erreur lors de l\'importation.');
      }
    });
  }

  updateRoles(char: Character) {
    if (!char.id) return;
    this.characterService.updateRoles(char.id, {
      isTank: char.is_tank || false,
      isHeal: char.is_heal || false,
      isDPS: char.is_dps || false
    }).subscribe({
      next: () => this.toast.success('Rôles mis à jour.'),
      error: (err) => {
        console.error('Error updating roles', err);
        this.toast.error('Erreur lors de la mise à jour des rôles.');
      }
    });
  }

  setMain(char: Character) {
    if (!char.id) return;
    this.characterService.setMainCharacter(char.id).subscribe({
      next: () => {
        this.loadMyCharacters();
        this.toast.success(`${char.name} est maintenant votre personnage principal.`);
      },
      error: (err) => {
        console.error('Error setting main character', err);
        this.toast.error('Erreur lors de la définition du Main.');
      }
    });
  }

  async removeCharacter(char: Character) {
    if (!char.id) return;
    const ok = await this.confirm.ask(
        'Retirer le personnage',
        `Voulez-vous vraiment retirer ${char.name} de votre liste ?`
    );

    if (ok) {
      this.characterService.removeCharacter(char.id).subscribe({
        next: () => {
          this.loadMyCharacters();
          this.toast.success(`${char.name} a été retiré.`);
        },
        error: (err) => {
          console.error('Error removing character', err);
          this.toast.error('Erreur lors de la suppression.');
        }
      });
    }
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
