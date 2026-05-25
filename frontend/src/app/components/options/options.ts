import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
  activeTab = signal<'characters' | 'settings'>('characters');

  constructor(public authService: AuthService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'settings') {
        this.activeTab.set('settings');
      }
      if (params['success'] === 'discord_linked') {
        alert('Compte Discord lié avec succès !');
      }
      if (params['error'] === 'discord_failed') {
        alert('Échec de la liaison Discord.');
      }
    });
  }

  linkDiscord() {
    this.authService.linkDiscord();
  }
}
