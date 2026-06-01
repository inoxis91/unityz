import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-select-guild',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './select-guild.html',
  styleUrl: './select-guild.css'
})
export class SelectGuildComponent implements OnInit {
  public authService = inject(AuthService);
  public i18n = inject(I18nService);
  private router = inject(Router);

  guilds = signal<any[]>([]);
  isLoading = signal(true);
  isImporting = signal(false);

  step = signal<1 | 2>(1);
  selectedGuild = signal<any | null>(null);
  availableCharacters = signal<any[]>([]);

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user && user.active_guild_id && user.active_guild_is_paid && !user.has_characters) {
      // Transition to Step 2 for their active guild automatically!
      // Fetch the full guild details first so we have the guild name and realm populated
      this.authService.getActiveGuild().subscribe({
        next: (guild) => {
          this.selectedGuild.set(guild);
          this.fetchCharactersForStep2(user.active_guild_id!);
        },
        error: () => {
          this.selectedGuild.set({ id: user.active_guild_id });
          this.fetchCharactersForStep2(user.active_guild_id!);
        }
      });
    } else {
      this.loadGuilds();
    }
  }

  loadGuilds() {
    this.isLoading.set(true);
    this.authService.getUserGuilds().subscribe({
      next: (data) => {
        this.guilds.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching guilds', err);
        this.isLoading.set(false);
      }
    });
  }

  fetchCharactersForStep2(guildId: string) {
    this.isLoading.set(true);
    this.authService.setActiveGuild(guildId).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.characters && res.characters.length > 0) {
          const mappedChars = res.characters.map((c: any) => ({
            ...c,
            selected: true,
            is_main: false
          }));

          // Set highest level character as main by default
          mappedChars.sort((a: any, b: any) => b.level - a.level);
          mappedChars[0].is_main = true;

          this.availableCharacters.set(mappedChars);
          this.step.set(2);
        } else {
          this.availableCharacters.set([]);
          this.step.set(2);
        }
      },
      error: (err) => {
        console.error('Error fetching characters for Step 2', err);
        this.isLoading.set(false);
      }
    });
  }

  selectGuild(guild: any) {
    this.isLoading.set(true);
    this.authService.setActiveGuild(guild.id).subscribe({
      next: (res) => {
        this.selectedGuild.set(guild);
        this.isLoading.set(false);

        // Check if guild is paid (active subscription)
        const isPaid = guild.subscription_tier !== 'none' && guild.subscription_expires_at && new Date(guild.subscription_expires_at) > new Date();

        if (!isPaid) {
          // If the guild is unpaid, redirect to payment directly!
          // Next time they access, the guard will redirect to select-guild step 2 once they pay.
          this.router.navigate(['/payment']);
        } else {
          // If the guild is already paid, show step 2 (character selection) immediately!
          if (res.characters && res.characters.length > 0) {
            const mappedChars = res.characters.map((c: any) => ({
              ...c,
              selected: true,
              is_main: false
            }));

            // Set highest level character as main by default
            mappedChars.sort((a: any, b: any) => b.level - a.level);
            mappedChars[0].is_main = true;

            this.availableCharacters.set(mappedChars);
            this.step.set(2);
          } else {
            this.availableCharacters.set([]);
            this.step.set(2);
          }
        }
      },
      error: (err) => {
        console.error('Error selecting active guild', err);
        this.isLoading.set(false);
      }
    });
  }

  toggleCharacterSelection(char: any) {
    char.selected = !char.selected;
    
    // If we unselected the main character, automatically assign another selected character as main
    if (!char.selected && char.is_main) {
      char.is_main = false;
      const otherSelected = this.availableCharacters().find(c => c.selected);
      if (otherSelected) {
        otherSelected.is_main = true;
      }
    }
  }

  setMainCharacter(char: any) {
    // A main character must be selected/imported
    if (!char.selected) {
      char.selected = true;
    }

    this.availableCharacters().forEach(c => {
      c.is_main = c.name === char.name;
    });
  }

  confirmImport() {
    const selectedList = this.availableCharacters().filter(c => c.selected);
    if (selectedList.length === 0) {
      alert('Veuillez sélectionner au moins un personnage à importer.');
      return;
    }

    const hasMain = selectedList.some(c => c.is_main);
    if (!hasMain) {
      alert('Veuillez désigner un personnage principal (Main).');
      return;
    }

    this.isImporting.set(true);
    this.authService.importCharacters(selectedList).subscribe({
      next: () => {
        this.isImporting.set(false);
        const user = this.authService.currentUser();
        
        // Rediriger en fonction de l'abonnement
        if (user?.active_guild_is_paid) {
          this.router.navigate(['/dashboard']);
        } else {
          this.router.navigate(['/payment']);
        }
      },
      error: (err) => {
        console.error('Error importing characters', err);
        this.isImporting.set(false);
        alert('Une erreur est survenue lors de l\'importation des personnages.');
      }
    });
  }

  goBackToStep1() {
    this.step.set(1);
    this.selectedGuild.set(null);
    this.availableCharacters.set([]);
  }
}
