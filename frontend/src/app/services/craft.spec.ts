import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CraftService } from './craft';

describe('CraftService', () => {
  let service: CraftService;
  let mockHttpClient: any;

  beforeEach(() => {
    mockHttpClient = {
      get: () => of([]),
      post: () => of({}),
      delete: () => of({})
    };

    TestBed.configureTestingModule({
      providers: [
        CraftService,
        { provide: HttpClient, useValue: mockHttpClient }
      ]
    });

    service = TestBed.inject(CraftService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial empty pendingRequests', () => {
    expect(service.pendingRequests()).toEqual([]);
    expect(service.pendingRequestsCount()).toBe(0);
  });
});
