import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ParticipantsComponent } from './participants';
import { CalendarService } from '../../../services/calendar';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';
import { provideRouter } from '@angular/router';

describe('ParticipantsComponent', () => {
  let component: ParticipantsComponent;
  let fixture: ComponentFixture<ParticipantsComponent>;

  const mockCalendarService = {
    authService: {
      currentUser: () => ({ id: '1' })
    },
    signup: () => of({})
  };

  const mockToastService = {
    success: () => {},
    error: () => {}
  };

  const mockI18nService = {
    t: (key: string) => key,
    currentLocale: () => 'fr'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantsComponent],
      providers: [
        provideRouter([]),
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: ToastService, useValue: mockToastService },
        { provide: I18nService, useValue: mockI18nService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ParticipantsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sort participants correctly by updated_at / signup_date', () => {
    const mockSignups = [
      {
        id: 'signup-1',
        user_id: 'user-1',
        character_name: 'Player A',
        status: 'signed_up',
        created_at: '2026-06-23T10:00:00.000Z',
        updated_at: '2026-06-23T12:00:00.000Z', // Updated later than B
        signup_date: '2026-06-23T12:00:00.000Z'
      },
      {
        id: 'signup-2',
        user_id: 'user-2',
        character_name: 'Player B',
        status: 'signed_up',
        created_at: '2026-06-23T11:00:00.000Z', // Created later than A, but updated_at is earlier than A's updated_at
        updated_at: '2026-06-23T11:00:00.000Z',
        signup_date: '2026-06-23T11:00:00.000Z'
      }
    ];

    component.signups = mockSignups;
    component.sortMethod.set('date');

    const sorted = component.sortedSignups();
    // B's updated_at (11:00) is earlier than A's updated_at (12:00)
    // So Player B should come first, then Player A
    expect(sorted[0].character_name).toBe('Player B');
    expect(sorted[1].character_name).toBe('Player A');
  });

  it('should sort participants correctly by updated_at / signup_date in descending order', () => {
    const mockSignups = [
      {
        id: 'signup-1',
        user_id: 'user-1',
        character_name: 'Player A',
        status: 'signed_up',
        created_at: '2026-06-23T10:00:00.000Z',
        updated_at: '2026-06-23T12:00:00.000Z', // Updated later than B
        signup_date: '2026-06-23T12:00:00.000Z'
      },
      {
        id: 'signup-2',
        user_id: 'user-2',
        character_name: 'Player B',
        status: 'signed_up',
        created_at: '2026-06-23T11:00:00.000Z',
        updated_at: '2026-06-23T11:00:00.000Z',
        signup_date: '2026-06-23T11:00:00.000Z'
      }
    ];

    component.signups = mockSignups;
    component.sortMethod.set('date');
    component.sortDirection.set('desc');

    const sorted = component.sortedSignups();
    // A's updated_at (12:00) is later than B's updated_at (11:00)
    // So Player A should come first under descending sort
    expect(sorted[0].character_name).toBe('Player A');
    expect(sorted[1].character_name).toBe('Player B');
  });

  it('should toggle sort direction on toggleDateSort', () => {
    // default should be 'date' and 'asc'
    expect(component.sortMethod()).toBe('date');
    expect(component.sortDirection()).toBe('asc');

    // Toggle should switch to 'desc'
    component.toggleDateSort();
    expect(component.sortMethod()).toBe('date');
    expect(component.sortDirection()).toBe('desc');

    // Toggle again should switch back to 'asc'
    component.toggleDateSort();
    expect(component.sortMethod()).toBe('date');
    expect(component.sortDirection()).toBe('asc');

    // Switch to status, then back to date
    component.sortMethod.set('status');
    component.toggleDateSort();
    expect(component.sortMethod()).toBe('date');
    expect(component.sortDirection()).toBe('asc');
  });
});
