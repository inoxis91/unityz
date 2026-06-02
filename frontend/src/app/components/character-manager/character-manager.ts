import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CharacterService, Character } from '../../services/character';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-character-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-manager.html',
  styleUrl: './character-manager.css'
})
export class CharacterManagerComponent implements OnInit {
  public i18n = inject(I18nService);

  bnetCharacters = signal<Character[]>([]);
  myCharacters = signal<Character[]>([]);
  loadingBnet = signal<boolean>(false);

  constructor(
    private characterService: CharacterService,
    public authService: AuthService,
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
        this.toast.success(this.i18n.t('char.manager.toast.add_success').replace('{name}', char.name));
        this.bnetCharacters.set(this.bnetCharacters().filter(c => c !== char));
        
        // Rafraîchir l'auth pour débloquer le site si c'est le premier perso
        this.authService.checkAuth().subscribe();
      },
      error: (err) => {
        console.error('Error importing character', err);
        this.toast.error(this.i18n.t('char.manager.toast.add_error'));
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
      next: () => this.toast.success(this.i18n.t('char.manager.toast.roles_success')),
      error: (err) => {
        console.error('Error updating roles', err);
        this.toast.error(this.i18n.t('char.manager.toast.roles_error'));
      }
    });
  }

  setMain(char: Character) {
    if (!char.id) return;
    this.characterService.setMainCharacter(char.id).subscribe({
      next: () => {
        this.loadMyCharacters();
        this.toast.success(this.i18n.t('char.manager.toast.main_success').replace('{name}', char.name));
      },
      error: (err) => {
        console.error('Error setting main character', err);
        this.toast.error(this.i18n.t('char.manager.toast.main_error'));
      }
    });
  }

  async removeCharacter(char: Character) {
    if (!char.id) return;
    const ok = await this.confirm.ask(
        this.i18n.t('char.manager.confirm.delete_title'),
        this.i18n.t('char.manager.confirm.delete_desc').replace('{name}', char.name)
    );

    if (ok) {
      this.characterService.removeCharacter(char.id).subscribe({
        next: () => {
          this.loadMyCharacters();
          this.toast.success(this.i18n.t('char.manager.toast.delete_success').replace('{name}', char.name));
        },
        error: (err) => {
          console.error('Error removing character', err);
          this.toast.error(this.i18n.t('char.manager.toast.delete_error'));
        }
      });
    }
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }
}
