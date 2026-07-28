import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';
import { AdminCharactersComponent } from './admin-characters';
import { CharacterService, GuildCharacterOverview } from '../../../services/character';
import { AuthService } from '../../../services/auth';
import { I18nService } from '../../../services/i18n';

describe('AdminCharactersComponent', () => {
  let component: AdminCharactersComponent;
  let fixture: ComponentFixture<AdminCharactersComponent>;

  const mockCharacters: GuildCharacterOverview[] = [
    {
      id: 'char-1',
      name: 'Arthas',
      realm: 'Elune',
      class: 'Chevalier de la mort',
      level: 80,
      is_tank: true,
      is_heal: false,
      is_dps: false,
      is_main: true,
      roster_id: 'roster-1',
      roster_name: 'Main Raid',
      owner_id: 'user-1',
      owner_battletag: 'LichKing#1234'
    },
    {
      id: 'char-2',
      name: 'Thrall',
      realm: 'Elune',
      class: 'Chaman',
      level: 80,
      is_tank: false,
      is_heal: false,
      is_dps: true,
      is_main: true,
      roster_id: null,
      roster_name: null,
      owner_id: 'user-2',
      owner_battletag: 'Warchief#5678'
    },
    {
      id: 'char-3',
      name: 'Jaina',
      realm: 'Hyjal',
      class: 'Mage',
      level: 70,
      is_tank: false,
      is_heal: false,
      is_dps: true,
      is_main: false,
      roster_id: null,
      roster_name: null,
      owner_id: 'user-1',
      owner_battletag: 'LichKing#1234'
    }
  ];

  const mockCharacterService = {
    getGuildCharactersOverview: () => of(mockCharacters),
    getClassId: (className: string | undefined) => {
      if (!className) return 'unknown';
      const map: { [key: string]: string } = {
        'guerrier': 'warrior',
        'paladin': 'paladin',
        'chasseur': 'hunter',
        'voleur': 'rogue',
        'prêtre': 'priest',
        'chevalier de la mort': 'death-knight',
        'chaman': 'shaman',
        'mage': 'mage',
        'démoniste': 'warlock',
        'moine': 'monk',
        'druide': 'druid',
        'chasseur de démons': 'demon-hunter',
        'évocateur': 'evoker'
      };
      return map[className.toLowerCase()] || className.toLowerCase();
    }
  };

  const mockAuthService = {
    currentUser: () => ({ id: 'user-1', role: 'admin' }),
    currentGuild: () => ({ id: 'guild-1', name: 'Unity' })
  };

  const mockI18nService = {
    t: (key: string) => key
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCharactersComponent],
      providers: [
        { provide: CharacterService, useValue: mockCharacterService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: HttpClient, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCharactersComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load characters on init', () => {
    expect(component.characters()).toEqual(mockCharacters);
    expect(component.loading()).toBe(false);
  });

  it('should format clean battletag', () => {
    expect(component.getCleanBattleTag('LichKing#1234')).toBe('LichKing');
    expect(component.getCleanBattleTag('')).toBe('');
  });

  it('should resolve correct class icon', () => {
    expect(component.getClassIcon('Chevalier de la mort')).toBe('assets/icons/class/dk.webp');
    expect(component.getClassIcon('Mage')).toBe('assets/icons/class/mage.webp');
  });

  it('should filter characters by search query', () => {
    component.searchQuery.set('arthas');
    expect(component.filteredCharacters().length).toBe(1);
    expect(component.filteredCharacters()[0].name).toBe('Arthas');

    component.searchQuery.set('LichKing');
    expect(component.filteredCharacters().length).toBe(2); // Arthas and Jaina belong to LichKing
  });

  it('should filter characters by class', () => {
    component.selectedClass.set('Chaman');
    expect(component.filteredCharacters().length).toBe(1);
    expect(component.filteredCharacters()[0].name).toBe('Thrall');
  });

  it('should filter characters by role', () => {
    component.selectedRole.set('tank');
    expect(component.filteredCharacters().length).toBe(1);
    expect(component.filteredCharacters()[0].name).toBe('Arthas');
  });

  it('should filter characters by main-only status', () => {
    component.showOnlyMains.set(true);
    expect(component.filteredCharacters().length).toBe(2); // Arthas and Thrall are mains
    expect(component.filteredCharacters().some(c => c.name === 'Jaina')).toBe(false);
  });
});
