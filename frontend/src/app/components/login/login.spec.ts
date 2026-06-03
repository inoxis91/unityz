import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LoginComponent } from './login';
import { AuthService } from '../../services/auth';
import { I18nService } from '../../services/i18n';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  const mockAuthService = {
    currentUser: () => null,
    checkAuth: () => of(null),
    getMockUsers: () => of([])
  };

  const mockI18nService = {
    t: (key: string) => key,
    currentLocale: signal('fr')
  };

  const mockActivatedRoute = {
    queryParams: of({})
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
