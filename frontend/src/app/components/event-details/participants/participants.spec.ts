import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ParticipantsComponent } from './participants';
import {
  countSignups,
  defaultRoleFor,
  isCharacterAllowed,
  signupDisplayName,
  sortSignups,
} from './participants-utils';
import { CalendarService, Signup, effectiveRole } from '../../../services/calendar';
import { ToastService } from '../../../services/toast';
import { ConfirmService } from '../../../services/confirm';
import { I18nService } from '../../../services/i18n';

const signup = (extra: Partial<Signup>): Signup =>
  ({
    id: 's',
    event_id: 'e',
    user_id: 'u',
    character_id: null,
    role: 'dps',
    status: 'signed_up',
    group_index: 0,
    comment: null,
    created_at: '2026-06-23T10:00:00.000Z',
    updated_at: '2026-06-23T10:00:00.000Z',
    ...extra,
  }) as Signup;

describe('participants-utils', () => {
  const a = signup({ user_id: 'a', status: 'absent', updated_at: '2026-06-23T09:00:00.000Z' });
  const b = signup({ user_id: 'b', status: 'signed_up', updated_at: '2026-06-23T12:00:00.000Z' });
  const c = signup({ user_id: 'c', status: 'standby', updated_at: '2026-06-23T11:00:00.000Z' });

  it('trie par date de réponse, dans les deux sens', () => {
    expect(sortSignups([b, c, a], 'date', 'asc').map((s) => s.user_id)).toEqual(['a', 'c', 'b']);
    expect(sortSignups([b, c, a], 'date', 'desc').map((s) => s.user_id)).toEqual(['b', 'c', 'a']);
  });

  it('trie par statut : présents, peut-être, absents', () => {
    expect(sortSignups([a, c, b], 'status', 'asc').map((s) => s.user_id)).toEqual(['b', 'c', 'a']);
  });

  it("respecte le poids du roster de l'événement", () => {
    const rosters = [
      { id: 'main', weight: 1 },
      { id: 'reroll', weight: 3 },
    ];
    const event = { roster_id: 'main', roster_weight: 2 };
    expect(isCharacterAllowed({ roster_id: 'main' }, event, rosters)).toBe(true);
    expect(isCharacterAllowed({ roster_id: 'reroll' }, event, rosters)).toBe(false);
    expect(isCharacterAllowed({ roster_id: null }, event, rosters)).toBe(false);
    expect(isCharacterAllowed({ roster_id: null }, { roster_id: null }, rosters)).toBe(true);
  });

  it('propose le rôle par défaut du personnage', () => {
    expect(defaultRoleFor({ is_tank: true, is_heal: true })).toBe('tank');
    expect(defaultRoleFor({ is_heal: true })).toBe('heal');
    expect(defaultRoleFor(undefined)).toBe('dps');
  });

  it('affiche le main pour un absent, le personnage inscrit sinon', () => {
    const s = signup({ character_name: 'Alt', main_character_name: 'Main', battletag: 'Joe#1' });
    expect(signupDisplayName(s, '?')).toBe('Alt');
    expect(signupDisplayName({ ...s, status: 'absent' }, '?')).toBe('Main');
    expect(signupDisplayName(signup({ battletag: 'Joe#1' }), '?')).toBe('Joe');
  });

  it('compte statuts et rôles (hors absents)', () => {
    const counts = countSignups(
      [
        signup({ role: 'tank' }),
        signup({ role: 'dps', assigned_role: 'heal', status: 'standby' }),
        signup({ role: 'dps', status: 'absent' }),
      ],
      effectiveRole,
    );
    expect(counts).toEqual({ signed_up: 1, standby: 1, absent: 1, tank: 1, heal: 1, dps: 0 });
  });
});

describe('ParticipantsComponent', () => {
  let component: ParticipantsComponent;
  let fixture: ComponentFixture<ParticipantsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantsComponent],
      providers: [
        provideRouter([]),
        { provide: CalendarService, useValue: { signup: () => of({}), unsignup: () => of({}) } },
        { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: I18nService, useValue: { t: (key: string) => key, currentLocale: () => 'fr' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ParticipantsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("pré-remplit le formulaire avec l'inscription existante du joueur", () => {
    fixture.componentRef.setInput('currentUserId', 'me');
    fixture.componentRef.setInput('myCharacters', [
      { id: 'c1', name: 'Main', realm: 'Ysondre', class: 'Guerrier', level: 80, is_main: true },
      { id: 'c2', name: 'Alt', realm: 'Ysondre', class: 'Prêtre', level: 80, is_heal: true },
    ]);
    fixture.componentRef.setInput('signups', [
      signup({
        user_id: 'me',
        character_id: 'c2',
        role: 'heal',
        status: 'standby',
        comment: 'retard',
      }),
    ]);

    expect(component.status()).toBe('standby');
    expect(component.characterId()).toBe('c2');
    expect(component.role()).toBe('heal');
    expect(component.comment()).toBe('retard');
    expect(component.isDirty()).toBe(false);
  });

  it('sélectionne le main par défaut sans inscription', () => {
    fixture.componentRef.setInput('myCharacters', [
      { id: 'c1', name: 'Alt', realm: 'Ysondre', class: 'Mage', level: 80 },
      {
        id: 'c2',
        name: 'Main',
        realm: 'Ysondre',
        class: 'Guerrier',
        level: 80,
        is_main: true,
        is_tank: true,
      },
    ]);
    expect(component.characterId()).toBe('c2');
    expect(component.role()).toBe('tank');
  });

  it('désactive l’inscription quand les inscriptions sont fermées', () => {
    fixture.componentRef.setInput('event', {
      id: 'event-1',
      title: 'Locked Event',
      description: '',
      start_time: '2099-06-27T20:00:00',
      end_time: '2099-06-27T23:00:00',
      type: 'raid',
      registrations_locked: true,
    });
    fixture.componentRef.setInput('myCharacters', [
      { id: 'char-1', name: 'Main', realm: 'Ysondre', class: 'Guerrier', level: 80, is_main: true },
    ]);
    expect(component.isSignupDisabled()).toBe(true);
  });

  it('bascule le sens du tri par date', () => {
    component.toggleDateSort();
    expect(component.sortDirection()).toBe('desc');
    component.sortMethod.set('status');
    component.toggleDateSort();
    expect(component.sortMethod()).toBe('date');
    expect(component.sortDirection()).toBe('asc');
  });
});
