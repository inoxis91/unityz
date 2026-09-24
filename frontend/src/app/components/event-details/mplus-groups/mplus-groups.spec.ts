import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MplusGroupsComponent } from './mplus-groups';
import { CalendarService, MplusGroupsState, Signup } from '../../../services/calendar';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';

function signup(user_id: string, role: string, group_index = 0, status = 'signed_up'): Signup {
  return {
    id: `s-${user_id}`,
    event_id: 'event-1',
    user_id,
    character_id: null,
    role,
    status,
    group_index,
    comment: null,
    created_at: '',
    updated_at: '',
    character_name: user_id,
    character_class: 'Mage',
    character_realm: 'Hyjal',
  };
}

function dropInto(
  groupIndex: number,
  item: Signup,
  from = -1,
): CdkDragDrop<number, unknown, Signup> {
  return {
    container: { data: groupIndex },
    previousContainer: { data: from },
    item: { data: item },
  } as unknown as CdkDragDrop<number, unknown, Signup>;
}

describe('MplusGroupsComponent', () => {
  let fixture: ComponentFixture<MplusGroupsComponent>;
  let component: MplusGroupsComponent;
  let emitted: MplusGroupsState[];

  const calendarService = {
    addMplusGroup: vi.fn(),
    deleteMplusGroup: vi.fn(),
    moveToMplusGroup: vi.fn(),
    setMplusAssignments: vi.fn(),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { ask: vi.fn() };
  const i18n = { t: (key: string) => key, currentLocale: () => 'fr' };

  const tank = signup('tank', 'tank', 1);
  const healer = signup('healer', 'heal');
  const dps = signup('dps', 'dps', 2);
  const absent = signup('absent', 'dps', 0, 'absent');
  const orphan = signup('orphan', 'dps', 5); // groupe supprimé via l'édition de l'événement

  beforeEach(async () => {
    vi.clearAllMocks();
    emitted = [];

    await TestBed.configureTestingModule({
      imports: [MplusGroupsComponent],
      providers: [
        { provide: CalendarService, useValue: calendarService },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
        { provide: I18nService, useValue: i18n },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MplusGroupsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('event', {
      id: 'event-1',
      title: 'Clés',
      type: 'mm+',
      description: '',
      start_time: '',
      end_time: '',
      mm_groups_count: 2,
    });
    fixture.componentRef.setInput('signups', [tank, healer, dps, absent, orphan]);
    fixture.componentRef.setInput('rioScores', new Map([['tank-hyjal', 3100]]));
    fixture.componentRef.setInput('canManage', true);
    component.stateChange.subscribe((s) => emitted.push(s));
    fixture.detectChanges();
  });

  it('splits players into groups and the unassigned pool, ignoring absents', () => {
    const groups = component.groups();
    expect(groups.map((g) => g.members.map((m) => m.user_id))).toEqual([['tank'], ['dps']]);
    expect(groups[0].avgScore).toBe(3100);
    expect(component.pool().map((s) => s.user_id)).toEqual(['healer', 'orphan']);
    expect(component.stats()).toMatchObject({ players: 4, placed: 2, groups: 2, ready: 0 });
  });

  it('shows a new group immediately, before the server answers', () => {
    const response = new Subject<MplusGroupsState>();
    calendarService.addMplusGroup.mockReturnValue(response);

    component.addGroup();
    fixture.detectChanges();

    expect(component.groups()).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('app-mplus-group-card')).toHaveLength(3);
    expect(component.addingGroup()).toBe(true);

    const server = { mm_groups_count: 3, assignments: [] };
    response.next(server);
    expect(emitted).toEqual([server]);
    expect(component.addingGroup()).toBe(false);
  });

  it('rolls back a new group when the server refuses it', () => {
    calendarService.addMplusGroup.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'GROUP_LIMIT' } })),
    );

    component.addGroup();

    expect(component.groups()).toHaveLength(2);
    expect(toast.error).toHaveBeenCalledWith('event.mplus.error_group_limit');
  });

  it('moves a dropped player optimistically and adopts the server state', () => {
    const server: MplusGroupsState = {
      mm_groups_count: 2,
      assignments: [
        { user_id: 'tank', group_index: 1 },
        { user_id: 'healer', group_index: 1 },
        { user_id: 'dps', group_index: 2 },
      ],
    };
    calendarService.moveToMplusGroup.mockReturnValue(of(server));

    component.onDrop(dropInto(1, healer, 0));

    expect(calendarService.moveToMplusGroup).toHaveBeenCalledWith('event-1', 'healer', 1);
    expect(component.groups()[0].members.map((m) => m.user_id)).toEqual(['tank', 'healer']);
    expect(emitted).toEqual([server]);
  });

  it('refuses to drop into a full group without calling the server', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => signup(id, 'dps', 1));
    fixture.componentRef.setInput('signups', [...five, healer]);

    component.move(healer, 1);

    expect(calendarService.moveToMplusGroup).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('event.mplus.error_group_full');
  });

  it('restores the previous placement when a move fails', () => {
    calendarService.moveToMplusGroup.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );

    component.move(tank, 2);

    expect(component.groups()[0].members.map((m) => m.user_id)).toEqual(['tank']);
    expect(toast.error).toHaveBeenCalledWith('event.mplus.error_generic');
  });

  it('asks before deleting a non-empty group and renumbers the next ones', async () => {
    confirm.ask.mockResolvedValue(true);
    calendarService.deleteMplusGroup.mockReturnValue(new Subject());

    await component.removeGroup(component.groups()[0]);

    expect(confirm.ask).toHaveBeenCalled();
    expect(calendarService.deleteMplusGroup).toHaveBeenCalledWith('event-1', 1);
    expect(component.groups().map((g) => g.members.map((m) => m.user_id))).toEqual([['dps']]);
    expect(component.pool().map((s) => s.user_id)).toContain('tank');
  });

  it('keeps everything when the deletion is not confirmed', async () => {
    confirm.ask.mockResolvedValue(false);
    await component.removeGroup(component.groups()[0]);
    expect(calendarService.deleteMplusGroup).not.toHaveBeenCalled();
  });

  it('sends the auto-fill placements in one request', () => {
    calendarService.setMplusAssignments.mockReturnValue(new Subject());

    component.autoFill();

    // Le groupe 2 (sans score) est plus faible que le groupe 1 (tank à 3100) : il est servi en premier
    expect(calendarService.setMplusAssignments).toHaveBeenCalledWith('event-1', [
      { user_id: 'healer', group_index: 2 },
      { user_id: 'orphan', group_index: 2 },
    ]);
  });

  it('opens the action sheet for managers and the characters modal for members', () => {
    const opened: Signup[] = [];
    component.openAlts.subscribe((s) => opened.push(s));

    component.onCardActivate(healer);
    expect(component.sheetSignup()?.user_id).toBe('healer');

    fixture.componentRef.setInput('canManage', false);
    component.closeSheet();
    component.onCardActivate(healer);
    expect(component.sheetSignup()).toBeNull();
    expect(opened).toEqual([healer]);
  });
});
