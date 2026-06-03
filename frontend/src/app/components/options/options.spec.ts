import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OptionsComponent } from './options';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';

describe('OptionsComponent', () => {
  let component: OptionsComponent;
  let fixture: ComponentFixture<OptionsComponent>;

  const mockAuthService = {
    currentUser: () => ({ id: 1, role: 'member', subscription_tier: 'free', subscription_expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }),
    currentGuild: () => ({ name: 'Test Guild' }),
    isGMOrOfficer: () => true,
    isAdmin: () => false,
    checkAuth: () => of({}),
    updateDiscordId: () => of({})
  };

  const mockI18nService = {
    t: (key: string) => key
  };

  const mockHttpClient = {
    post: () => of({}),
    get: () => of({})
  };

  const mockToastService = {
    success: () => {},
    error: () => {},
    info: () => {}
  };

  const mockConfirmService = {
    ask: () => Promise.resolve(true)
  };

  const mockActivatedRoute = {
    queryParams: of({ tab: 'settings' })
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmService, useValue: mockConfirmService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OptionsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate remaining days correctly', () => {
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const remainingDays = component.getRemainingDays(expiresAt);
    expect(remainingDays).toBe(5);
  });

  it('should return 0 remaining days for null/undefined/past dates', () => {
    expect(component.getRemainingDays(null)).toBe(0);
    expect(component.getRemainingDays(undefined)).toBe(0);
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    expect(component.getRemainingDays(pastDate)).toBe(0);
  });

  it('should translate subscription tiers correctly', () => {
    expect(component.getTierLabel('free')).toBe('options.sub.tier_free');
    expect(component.getTierLabel('medium')).toBe('options.sub.tier_medium');
    expect(component.getTierLabel('pro')).toBe('options.sub.tier_pro');
    expect(component.getTierLabel(undefined)).toBe('options.sub.tier_none');
  });
});
