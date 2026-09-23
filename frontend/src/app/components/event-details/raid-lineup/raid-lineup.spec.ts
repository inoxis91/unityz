import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { RaidLineupComponent } from './raid-lineup';
import { CalendarService, LineupEntry, Signup } from '../../../services/calendar';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';
import { ConfirmService } from '../../../services/confirm';

function signup(partial: Partial<Signup> & Pick<Signup, 'user_id' | 'role'>): Signup {
  return {
    id: `s-${partial.user_id}`,
    event_id: 'event-1',
    character_id: `c-${partial.user_id}`,
    status: 'signed_up',
    group_index: 0,
    comment: null,
    created_at: '',
    updated_at: '',
    selection: null,
    assigned_role: null,
    character_name: partial.user_id,
    character_class: 'Paladin',
    user_characters: [{ id: `c-${partial.user_id}`, is_tank: true, is_heal: true, is_dps: true }],
    ...partial,
  };
}

function dropInto(zone: string, item: Signup): CdkDragDrop<string, unknown, Signup> {
  return {
    container: { data: zone },
    previousContainer: { data: 'other' },
    item: { data: item },
  } as unknown as CdkDragDrop<string, unknown, Signup>;
}

describe('RaidLineupComponent', () => {
  let fixture: ComponentFixture<RaidLineupComponent>;
  let component: RaidLineupComponent;
  let emitted: LineupEntry[][];

  const calendarService = {
    updateLineupEntry: vi.fn(),
    bulkUpdateLineup: vi.fn(),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { ask: vi.fn() };
  const i18n = { t: (key: string) => key, currentLocale: () => 'fr' };

  const tank = signup({ user_id: 'tank', role: 'tank' });
  const healer = signup({ user_id: 'healer', role: 'heal', selection: 'selected' });
  const benched = signup({ user_id: 'benched', role: 'dps', selection: 'benched' });
  const forced = signup({
    user_id: 'forced',
    role: 'dps',
    assigned_role: 'heal',
    selection: 'selected',
  });
  const absent = signup({ user_id: 'absent', role: 'dps', status: 'absent' });
  const dpsOnly = signup({
    user_id: 'dpsonly',
    role: 'dps',
    user_characters: [{ id: 'c-dpsonly', is_tank: false, is_heal: false, is_dps: true }],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    emitted = [];

    await TestBed.configureTestingModule({
      imports: [RaidLineupComponent],
      providers: [
        { provide: CalendarService, useValue: calendarService },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
        { provide: I18nService, useValue: i18n },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RaidLineupComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('event', {
      id: 'event-1',
      title: 'Raid',
      type: 'raid',
      description: '',
      start_time: '',
      end_time: '',
    });
    fixture.componentRef.setInput('signups', [tank, healer, benched, forced, absent, dpsOnly]);
    fixture.componentRef.setInput('canManage', true);
    component.entriesChange.subscribe((entries) => emitted.push(entries));
    fixture.detectChanges();
  });

  it('groups players by decision and effective role, ignoring absents', () => {
    expect(component.pool().map((s) => s.user_id)).toEqual(['tank', 'dpsonly']);
    expect(component.selectedByRole().heal.map((s) => s.user_id)).toEqual(['forced', 'healer']);
    expect(component.selectedByRole().dps).toEqual([]);
    expect(component.bench().map((s) => s.user_id)).toEqual(['benched']);
    expect(component.selectedCount()).toBe(2);
  });

  it('selects and assigns the role of the target column on drop', () => {
    const server: LineupEntry = {
      user_id: 'tank',
      role: 'tank',
      selection: 'selected',
      assigned_role: 'heal',
    };
    calendarService.updateLineupEntry.mockReturnValue(of(server));

    component.onDrop(dropInto('heal', tank));

    expect(calendarService.updateLineupEntry).toHaveBeenCalledWith('event-1', 'tank', {
      selection: 'selected',
      assigned_role: 'heal',
    });
    expect(emitted).toEqual([[server], [server]]);
  });

  it('clears the assigned role when a player is dropped on their own role', () => {
    calendarService.updateLineupEntry.mockReturnValue(of({}));
    component.onDrop(dropInto('dps', forced));
    expect(calendarService.updateLineupEntry).toHaveBeenCalledWith('event-1', 'forced', {
      selection: 'selected',
      assigned_role: null,
    });
  });

  it('rejects role columns the character cannot play', () => {
    const predicate = component.canEnter;
    const drag = { data: dpsOnly } as never;
    expect(predicate(drag, { data: 'tank' } as never)).toBe(false);
    expect(predicate(drag, { data: 'dps' } as never)).toBe(true);
    expect(predicate(drag, { data: 'bench' } as never)).toBe(true);
  });

  it('rolls back and shows a mapped error when the API fails', () => {
    calendarService.updateLineupEntry.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'SIGNUP_ABSENT' } })),
    );

    component.setSelection(tank, 'benched');

    expect(emitted[0][0].selection).toBe('benched');
    expect(emitted[1][0]).toEqual({
      user_id: 'tank',
      role: 'tank',
      selection: null,
      assigned_role: null,
    });
    expect(toast.error).toHaveBeenCalledWith('event.lineup.error_signup_absent');
  });

  it('does not call the API when nothing changes', () => {
    component.setSelection(healer, 'selected');
    component.assignRole(healer, 'heal');
    expect(calendarService.updateLineupEntry).not.toHaveBeenCalled();
  });

  it('selects every pending player in one request', () => {
    calendarService.bulkUpdateLineup.mockReturnValue(of([]));
    component.selectAllPending();
    expect(calendarService.bulkUpdateLineup).toHaveBeenCalledWith(
      'event-1',
      ['tank', 'dpsonly'],
      'selected',
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('asks for confirmation before resetting the line-up', async () => {
    confirm.ask.mockResolvedValue(false);
    await component.resetAll();
    expect(calendarService.bulkUpdateLineup).not.toHaveBeenCalled();

    confirm.ask.mockResolvedValue(true);
    calendarService.bulkUpdateLineup.mockReturnValue(of([]));
    await component.resetAll();
    expect(calendarService.bulkUpdateLineup).toHaveBeenCalledWith(
      'event-1',
      expect.arrayContaining(['healer', 'benched', 'forced']),
      null,
    );
  });

  it('opens the decision sheet for managers and the characters modal otherwise', () => {
    const openAlts = vi.fn();
    component.openAlts.subscribe(openAlts);

    component.onCardActivate(tank);
    expect(component.sheetSignup()?.user_id).toBe('tank');
    expect(openAlts).not.toHaveBeenCalled();

    component.closeSheet();
    fixture.componentRef.setInput('canManage', false);
    component.onCardActivate(tank);
    expect(component.sheetSignup()).toBeNull();
    expect(openAlts).toHaveBeenCalledWith(tank);
  });
});
