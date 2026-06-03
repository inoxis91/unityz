import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from './auth';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    const mockHttpClient = {
      get: () => of({}),
      post: () => of({})
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: HttpClient, useValue: mockHttpClient }
      ]
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
