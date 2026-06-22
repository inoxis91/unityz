import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminRostersComponent } from './admin-rosters';
import { RosterService } from '../../../services/roster';
import { CharacterService, Character } from '../../../services/character';
import { ConfirmService } from '../../../services/confirm';
import { ToastService } from '../../../services/toast';
import { AuthService } from '../../../services/auth';
import { I18nService } from '../../../services/i18n';

describe('AdminRostersComponent', () => {
  let component: AdminRostersComponent;
  let fixture: ComponentFixture<AdminRostersComponent>;

  const mockRosterService = {
    rosters: signal([]),
    unassignedCharacters: signal([]),
    loadRosters: () => of([]),
    loadUnassignedCharacters: () => of([]),
    assignCharacter: (charId: string, rosterId: string | null) => of({ success: true })
  };

  const mockCharacterService = {
    getClassId: (className: string | undefined) => 'warrior',
    getWarcraftLogsUrl: (name: string, realm: string) => ''
  };

  const mockAuthService = {
    currentUser: () => ({ id: 1, subscription_tier: 'pro' }),
    currentGuild: () => null
  };

  const mockConfirmService = {
    ask: () => Promise.resolve(true)
  };

  const mockToastService = {
    success: () => {},
    error: () => {}
  };

  const mockI18nService = {
    t: (key: string) => key
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminRostersComponent],
      providers: [
        { provide: RosterService, useValue: mockRosterService },
        { provide: CharacterService, useValue: mockCharacterService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfirmService, useValue: mockConfirmService },
        { provide: ToastService, useValue: mockToastService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: HttpClient, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminRostersComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open context menu on right click', () => {
    const mockEvent = {
      preventDefault: () => {},
      clientX: 100,
      clientY: 200
    } as unknown as MouseEvent;

    const mockChar: Character = {
      id: 'char-1',
      name: 'TestChar',
      realm: 'Elune',
      class: 'Guerrier',
      level: 80
    };

    component.onContextMenu(mockEvent, mockChar, 'roster-1');

    expect(component.contextMenuVisible()).toBe(true);
    expect(component.contextMenuCharacter()).toEqual(mockChar);
    expect(component.contextMenuCurrentRosterId()).toBe('roster-1');
    expect(component.contextMenuPosition()).toEqual({ x: 100, y: 200 });
  });

  it('should close context menu on document click', () => {
    component.contextMenuVisible.set(true);

    const mockEvent = {} as MouseEvent;
    component.onDocumentClick(mockEvent);

    expect(component.contextMenuVisible()).toBe(false);
  });

  it('should assign character and reload on moveToRoster', () => {
    const mockChar: Character = {
      id: 'char-1',
      name: 'TestChar',
      realm: 'Elune',
      class: 'Guerrier',
      level: 80
    };

    component.contextMenuCharacter.set(mockChar);
    component.contextMenuVisible.set(true);

    const assignSpy = vi.spyOn(mockRosterService, 'assignCharacter');
    const loadSpy = vi.spyOn(component, 'loadAll');

    component.moveToRoster('roster-2');

    expect(assignSpy).toHaveBeenCalledWith('char-1', 'roster-2');
    expect(component.contextMenuVisible()).toBe(false);
    expect(loadSpy).toHaveBeenCalled();
  });
});
