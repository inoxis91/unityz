import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NavbarComponent } from './navbar';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;

  const mockAuthService = {
    currentUser: () => ({ id: 1, active_guild_id: 1, subscription_tier: 'free', active_guild_is_paid: true }),
    currentGuild: () => ({ name: 'Test Guild' }),
    canAccessAdmin: () => false,
    logout: () => of(null)
  };

  const mockI18nService = {
    t: (key: string) => key,
    currentLocale: signal('fr')
  };

  const mockRouter = {
    events: of({}),
    navigate: () => Promise.resolve(true)
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarComponent, RouterModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
