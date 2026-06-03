import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app';
import { AuthService } from './services/auth';
import { I18nService } from './services/i18n';
import { ToastService } from './services/toast';
import { ConfirmService } from './services/confirm';

describe('AppComponent', () => {
  const mockRouter = {
    events: of({}),
    navigate: () => Promise.resolve(true)
  };

  const mockAuthService = {
    currentUser: () => null,
    currentGuild: () => null,
    isGMOrOfficer: () => false
  };

  const mockI18nService = {
    t: (key: string) => key
  };

  const mockToastService = {
    toasts: () => []
  };

  const mockConfirmService = {
    activeConfig: () => null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmService, useValue: mockConfirmService }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
