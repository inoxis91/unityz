import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CharacterService, GuildCharacterOverview } from '../../services/character';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-guild-characters',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './guild-characters.html',
  styleUrl: './guild-characters.css'
})
export class GuildCharactersComponent implements OnInit {
  public i18n = inject(I18nService);
  private characterService = inject(CharacterService);

  allCharacters = signal<GuildCharacterOverview[]>([]);
  loading = signal<boolean>(false);

  // Group by main/alt
  mains = computed(() => this.allCharacters().filter(c => c.is_main));
  alts = computed(() => this.allCharacters().filter(c => !c.is_main));

  // Mains by role
  mainTanks = computed(() => this.mains().filter(c => c.is_tank).sort((a, b) => a.name.localeCompare(b.name)));
  mainHealers = computed(() => this.mains().filter(c => c.is_heal).sort((a, b) => a.name.localeCompare(b.name)));
  mainDps = computed(() => this.mains().filter(c => c.is_dps).sort((a, b) => a.name.localeCompare(b.name)));

  // Alts by role
  altTanks = computed(() => this.alts().filter(c => c.is_tank).sort((a, b) => a.name.localeCompare(b.name)));
  altHealers = computed(() => this.alts().filter(c => c.is_heal).sort((a, b) => a.name.localeCompare(b.name)));
  altDps = computed(() => this.alts().filter(c => c.is_dps).sort((a, b) => a.name.localeCompare(b.name)));

  ngOnInit() {
    this.loadCharacters();
  }

  loadCharacters() {
    this.loading.set(true);
    this.characterService.getGuildCharactersRoster().subscribe({
      next: (chars) => {
        this.allCharacters.set(chars);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading guild characters roster:', err);
        this.loading.set(false);
      }
    });
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  getClassIcon(className: string | undefined): string {
    const classId = this.getClassCategory(className);
    const iconMap: { [key: string]: string } = {
      'warrior': 'warrior.webp',
      'paladin': 'paladin.webp',
      'hunter': 'hunt.webp',
      'rogue': 'rogue.webp',
      'priest': 'priest.webp',
      'death-knight': 'dk.webp',
      'shaman': 'shaman.webp',
      'mage': 'mage.webp',
      'warlock': 'warlock.webp',
      'monk': 'monk.webp',
      'druid': 'drood.webp',
      'demon-hunter': 'dh.webp',
      'evoker': 'evoker.webp'
    };
    return `assets/icons/class/${iconMap[classId] || 'unknown.png'}`;
  }

  getRaiderIoUrl(name: string, realm: string): string {
    return this.characterService.getRaiderIoUrl(name, realm);
  }

  getWarcraftLogsUrl(name: string, realm: string): string {
    return this.characterService.getWarcraftLogsUrl(name, realm);
  }
}
