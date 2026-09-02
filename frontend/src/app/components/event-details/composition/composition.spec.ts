import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CompositionComponent } from './composition';
import { CalendarService } from '../../../services/calendar';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';
import { provideRouter } from '@angular/router';

describe('CompositionComponent', () => {
  let component: CompositionComponent;
  let fixture: ComponentFixture<CompositionComponent>;

  const mockCalendarService = {
    updateGroupsCount: vi.fn().mockReturnValue(of({})),
    deleteGroup: vi.fn().mockReturnValue(of({})),
    updateSignupGroup: vi.fn().mockReturnValue(of({})),
  };

  const mockToastService = {
    success: vi.fn(),
    error: vi.fn(),
  };

  const mockI18nService = {
    t: (key: string) => key,
    currentLocale: () => 'fr',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [CompositionComponent],
      providers: [
        provideRouter([]),
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: ToastService, useValue: mockToastService },
        { provide: I18nService, useValue: mockI18nService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompositionComponent);
    component = fixture.componentInstance;

    component.event = {
      id: 'event-1',
      title: 'Donjon MM+',
      type: 'mm+',
      mm_groups_count: 2,
    };
    component.canManageEvents = true;
    component.rioScores = new Map();

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute unassigned members and MM groups correctly', () => {
    const mockSignups = [
      { user_id: '1', character_name: 'TankPlayer', role: 'tank', status: 'signed_up', group_index: 0 },
      { user_id: '2', character_name: 'HealPlayer', role: 'heal', status: 'signed_up', group_index: 1 },
      { user_id: '3', character_name: 'DpsPlayer1', role: 'dps', status: 'signed_up', group_index: 1 },
      { user_id: '4', character_name: 'DpsPlayer2', role: 'dps', status: 'signed_up', group_index: 2 },
    ];

    component.signups = mockSignups;

    // Unassigned (group_index = 0)
    const unassigned = component.unassignedMembers();
    expect(unassigned.length).toBe(1);
    expect(unassigned[0].character_name).toBe('TankPlayer');

    // MM Groups (count = 2)
    const groups = component.mmGroups();
    expect(groups.length).toBe(2);

    // Group 1
    expect(groups[0].index).toBe(1);
    expect(groups[0].members.length).toBe(2);
    expect(groups[0].heals.length).toBe(1);
    expect(groups[0].heals[0].character_name).toBe('HealPlayer');
    expect(groups[0].dps.length).toBe(1);
    expect(groups[0].dps[0].character_name).toBe('DpsPlayer1');

    // Group 2
    expect(groups[1].index).toBe(2);
    expect(groups[1].members.length).toBe(1);
    expect(groups[1].dps.length).toBe(1);
    expect(groups[1].dps[0].character_name).toBe('DpsPlayer2');
  });

  it('should support drag and drop using event.item.data', () => {
    const mockSignups = [
      { user_id: '1', character_name: 'TankPlayer', role: 'tank', status: 'signed_up', group_index: 0 },
    ];
    component.signups = mockSignups;

    const dragEvent = {
      previousContainer: { data: [] },
      container: {},
      item: { data: mockSignups[0] },
      previousIndex: 0,
      currentIndex: 0,
    } as any;

    const emitSpy = vi.spyOn(component.compositionChanged, 'emit');

    component.dropToGroup(dragEvent, 1);

    // Optimistic update
    expect(component.signupsSig()[0].group_index).toBe(1);

    // Service call
    expect(mockCalendarService.updateSignupGroup).toHaveBeenCalledWith('event-1', '1', 1);
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should call deleteGroup on onRemoveGroup and shift other groups', () => {
    const mockSignups = [
      { user_id: '1', character_name: 'PlayerG1', role: 'tank', status: 'signed_up', group_index: 1 },
      { user_id: '2', character_name: 'PlayerG2', role: 'heal', status: 'signed_up', group_index: 2 },
    ];
    component.signups = mockSignups;

    const emitSpy = vi.spyOn(component.compositionChanged, 'emit');

    component.onRemoveGroup(1);

    // Optimistic check:
    // PlayerG1 (group_index 1) goes to 0
    // PlayerG2 (group_index 2) shifted to 1 (since 2 > 1)
    const updated = component.signupsSig();
    expect(updated.find(s => s.user_id === '1')?.group_index).toBe(0);
    expect(updated.find(s => s.user_id === '2')?.group_index).toBe(1);

    // Event mm_groups_count decremented
    expect(component.event.mm_groups_count).toBe(1);

    expect(mockCalendarService.deleteGroup).toHaveBeenCalledWith('event-1', 1);
    expect(emitSpy).toHaveBeenCalled();
  });
});
