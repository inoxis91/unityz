import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CharacterService, Character } from '../../services/character';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';

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
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.authService.checkAuth().subscribe({
      next: () => {
        this.loadMyCharacters();
      },
      error: () => {
        window.location.href = '/';
      }
    });
  }


  loadMyCharacters() {
    this.characterService.getMyCharacters().subscribe({
      next: (chars) => {
        console.log('My DB characters:', chars);
        this.myCharacters.set(chars);
      },
      error: (err) => console.error('Error loading my characters', err)
    });
  }

  fetchBnetCharacters() {
    this.loadingBnet.set(true);
    console.log('Fetching Bnet characters...');
    this.characterService.getBnetCharacters().subscribe({
      next: (chars) => {
        console.log('Received characters from service:', chars);
        
        // Filtrer les persos déjà importés
        const currentMyChars = this.myCharacters();
        const filtered = chars.filter(bc => 
          !currentMyChars.some(mc => mc.name === bc.name && mc.realm === bc.realm)
        );
        
        console.log('Setting bnetCharacters signal with:', filtered.length, 'items');
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
        // Mettre à jour la liste Bnet
        this.bnetCharacters.set(this.bnetCharacters().filter(c => c !== char));
      },
      error: (err) => console.error('Error importing character', err)
    });
  }

  updateRoles(char: Character) {
    if (!char.id) return;
    this.characterService.updateRoles(char.id, {
      isTank: char.is_tank || false,
      isHeal: char.is_heal || false,
      isDPS: char.is_dps || false
    }).subscribe({
      next: () => console.log('Roles updated for', char.name),
      error: (err) => console.error('Error updating roles', err)
    });
  }

  setMain(char: Character) {
    if (!char.id) return;
    this.characterService.setMainCharacter(char.id).subscribe({
      next: () => this.loadMyCharacters(),
      error: (err) => console.error('Error setting main character', err)
    });
  }

  removeCharacter(char: Character) {
    if (!char.id) return;
    if (confirm(`Voulez-vous vraiment retirer ${char.name} de votre liste ?`)) {
      this.characterService.removeCharacter(char.id).subscribe({
        next: () => this.loadMyCharacters(),
        error: (err) => console.error('Error removing character', err)
      });
    }
  }
}
