import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DashboardComponent } from './dashboard';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { CharacterService } from '../../services/character';
import { CalendarService } from '../../services/calendar';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  const mockAuthService = {
    currentUser: () => ({ id: 1, active_guild_id: 1, subscription_tier: 'free' }),
    currentGuild: () => ({ id: 1, name: 'Test Guild' }),
    getGuildBirthdays: () => of([]),
    getAttendance: () => of({
      percentage: 75,
      total_eligible: 4,
      attended: 3,
      events: [
        { id: '1', title: 'Raid 1', start_time: '2026-06-01T20:00:00', type: 'raid', status: 'signed_up' }
      ]
    })
  };

  const mockI18nService = {
    t: (key: string) => key,
    currentLocale: signal('fr')
  };

  const mockCharacterService = {
    getMyCharacters: () => of([]),
    getRioScore: () => of(0),
    getCharacterDetails: () => of(null),
    getCharacterParses: () => of(null)
  };

  const mockCalendarService = {
    getMyRegisteredEvents: () => of([]),
    getAvailableEvents: () => of([]),
    getEvents: () => of([]),
    getMySignups: () => of([])
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: CharacterService, useValue: mockCharacterService },
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load attendance data on init', () => {
    fixture.detectChanges();
    const attendance = component.myAttendance();
    expect(attendance).toBeTruthy();
    expect(attendance?.percentage).toBe(75);
    expect(attendance?.total_eligible).toBe(4);
    expect(attendance?.attended).toBe(3);
    expect(attendance?.events.length).toBe(1);
  });
});
