import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CharacterService, GuildCharacterOverview } from '../../../services/character';
import { I18nService } from '../../../services/i18n';
import { AuthService } from '../../../services/auth';

@Component({
  selector: 'app-admin-characters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-characters.html',
  styleUrl: './admin-characters.css',
})
export class AdminCharactersComponent implements OnInit {
  private characterService = inject(CharacterService);
  public i18n = inject(I18nService);
  public authService = inject(AuthService);

  characters = signal<GuildCharacterOverview[]>([]);
  loading = signal<boolean>(false);

  // Filters state
  searchQuery = signal<string>('');
  selectedClass = signal<string>('all');
  selectedRole = signal<'all' | 'tank' | 'heal' | 'dps'>('all');
  showOnlyMains = signal<boolean>(false);

  // Sorting state
  sortBy = signal<'name' | 'class' | 'level' | 'owner' | 'roster'>('owner');
  sortOrder = signal<'asc' | 'desc'>('asc');

  classesList = computed(() => {
    const chars = this.characters();
    const unique = new Set(chars.map((c) => c.class).filter(Boolean));
    return Array.from(unique).sort();
  });

  filteredCharacters = computed(() => {
    let list = this.characters();
    const query = this.searchQuery().toLowerCase().trim();
    const classFilter = this.selectedClass();
    const roleFilter = this.selectedRole();
    const mainsOnly = this.showOnlyMains();

    // 1. Apply Search Query
    if (query) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.owner_battletag.toLowerCase().includes(query)
      );
    }

    // 2. Apply Class Filter
    if (classFilter !== 'all') {
      list = list.filter((c) => c.class === classFilter);
    }

    // 3. Apply Role Filter
    if (roleFilter !== 'all') {
      if (roleFilter === 'tank') list = list.filter((c) => c.is_tank);
      if (roleFilter === 'heal') list = list.filter((c) => c.is_heal);
      if (roleFilter === 'dps') list = list.filter((c) => c.is_dps);
    }

    // 4. Apply Mains Only Filter
    if (mainsOnly) {
      list = list.filter((c) => c.is_main);
    }

    // 5. Apply Sorting
    const sortField = this.sortBy();
    const order = this.sortOrder();

    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'class') {
        valA = a.class ? a.class.toLowerCase() : '';
        valB = b.class ? b.class.toLowerCase() : '';
      } else if (sortField === 'level') {
        valA = a.level;
        valB = b.level;
      } else if (sortField === 'owner') {
        valA = a.owner_battletag.toLowerCase();
        valB = b.owner_battletag.toLowerCase();
      } else if (sortField === 'roster') {
        valA = a.roster_name ? a.roster_name.toLowerCase() : '';
        valB = b.roster_name ? b.roster_name.toLowerCase() : '';
      }

      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });
  });

  ngOnInit() {
    this.loadCharacters();
  }

  loadCharacters() {
    this.loading.set(true);
    this.characterService.getGuildCharactersOverview().subscribe({
      next: (chars) => {
        this.characters.set(chars);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading guild characters', err);
        this.loading.set(false);
      },
    });
  }

  toggleSort(field: 'name' | 'class' | 'level' | 'owner' | 'roster') {
    if (this.sortBy() === field) {
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('asc');
    }
  }

  getClassCategory(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  getClassIcon(className: string | undefined): string {
    const classId = CharacterService.getClassId(className);
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
      'evoker': 'evoker.webp',
    };
    const icon = iconMap[classId] || 'warrior.webp';
    return `assets/icons/class/${icon}`;
  }

  getCleanBattleTag(battletag: string): string {
    if (!battletag) return '';
    return battletag.split('#')[0];
  }
}
