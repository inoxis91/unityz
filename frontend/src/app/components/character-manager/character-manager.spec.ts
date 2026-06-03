import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CharacterManagerComponent } from './character-manager';
import { CharacterService } from '../../services/character';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { I18nService } from '../../services/i18n';

describe('CharacterManagerComponent', () => {
  let component: CharacterManagerComponent;
  let fixture: ComponentFixture<CharacterManagerComponent>;

  const mockCharacterService = {
    getMyCharacters: () => of([]),
    getBnetCharacters: () => of([])
  };

  const mockAuthService = {
    currentUser: () => ({ id: 1 }),
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
      imports: [CharacterManagerComponent],
      providers: [
        { provide: CharacterService, useValue: mockCharacterService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfirmService, useValue: mockConfirmService },
        { provide: ToastService, useValue: mockToastService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: HttpClient, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CharacterManagerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
