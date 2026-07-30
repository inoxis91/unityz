import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GuildCharactersComponent } from './guild-characters';
import { CharacterService, GuildCharacterOverview } from '../../services/character';
import { I18nService } from '../../services/i18n';

describe('GuildCharactersComponent', () => {
  let component: GuildCharactersComponent;
  let fixture: ComponentFixture<GuildCharactersComponent>;

  const mockCharacters: GuildCharacterOverview[] = [
    {
      id: '1',
      name: 'MainTank',
      realm: 'Hyjal',
      class: 'Guerrier',
      level: 80,
      is_tank: true,
      is_heal: false,
      is_dps: false,
      is_main: true,
      roster_id: null,
      roster_name: null,
      owner_id: 'user-1',
      owner_battletag: 'User#1234'
    },
    {
      id: '2',
      name: 'MainHealer',
      realm: 'Hyjal',
      class: 'Prêtre',
      level: 80,
      is_tank: false,
      is_heal: true,
      is_dps: false,
      is_main: true,
      roster_id: null,
      roster_name: null,
      owner_id: 'user-2',
      owner_battletag: 'User#5678'
    },
    {
      id: '3',
      name: 'AltDps',
      realm: 'Hyjal',
      class: 'Mage',
      level: 80,
      is_tank: false,
      is_heal: false,
      is_dps: true,
      is_main: false,
      roster_id: null,
      roster_name: null,
      owner_id: 'user-1',
      owner_battletag: 'User#1234'
    }
  ];

  const mockCharacterService = {
    getGuildCharactersRoster: () => of(mockCharacters),
    getRaiderIoUrl: (name: string, realm: string) => `https://raider.io/${name}`,
    getWarcraftLogsUrl: (name: string, realm: string) => `https://wcl.com/${name}`
  };

  const mockI18nService = {
    t: (key: string) => key,
    currentLocale: signal('fr')
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuildCharactersComponent],
      providers: [
        { provide: CharacterService, useValue: mockCharacterService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GuildCharactersComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load characters on init and group them correctly', () => {
    fixture.detectChanges();
    
    // Check mains vs alts
    expect(component.mains().length).toBe(2);
    expect(component.alts().length).toBe(1);

    // Check roles
    expect(component.mainTanks().length).toBe(1);
    expect(component.mainTanks()[0].name).toBe('MainTank');

    expect(component.mainHealers().length).toBe(1);
    expect(component.mainHealers()[0].name).toBe('MainHealer');

    expect(component.altDps().length).toBe(1);
    expect(component.altDps()[0].name).toBe('AltDps');
  });

  it('should map class names to class ids', () => {
    expect(component.getClassCategory('Guerrier')).toBe('warrior');
    expect(component.getClassCategory('Prêtre')).toBe('priest');
    expect(component.getClassCategory('Mage')).toBe('mage');
  });
});
