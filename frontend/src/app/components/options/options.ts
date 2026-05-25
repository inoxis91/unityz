import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { CharacterManagerComponent } from '../character-manager/character-manager';

@Component({
  selector: 'app-options',
  standalone: true,
  imports: [CommonModule, FormsModule, CharacterManagerComponent],
  templateUrl: './options.html',
  styleUrl: './options.css'
})
export class OptionsComponent implements OnInit {
  discordId = '';
  activeTab = signal<'characters' | 'settings'>('characters');

  constructor(public authService: AuthService) {}

  ngOnInit() {
    this.discordId = this.authService.currentUser()?.discord_id || '';
  }

  saveDiscordId() {
    this.authService.updateDiscordId(this.discordId).subscribe({
      next: () => alert('Paramètres mis à jour avec succès !'),
      error: () => alert('Erreur lors de la mise à jour.')
    });
  }
}
