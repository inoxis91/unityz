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
  discordPseudo = '';
  activeTab = signal<'characters' | 'settings'>('characters');

  constructor(public authService: AuthService) {}

  ngOnInit() {}

  linkDiscord() {
    if (!this.discordPseudo) return;
    this.authService.linkDiscordByPseudo(this.discordPseudo).subscribe({
      next: () => {
        alert('Compte Discord lié avec succès !');
        this.discordPseudo = '';
      },
      error: (err) => {
        alert(err.error?.message || 'Erreur lors de la liaison.');
      }
    });
  }
}
