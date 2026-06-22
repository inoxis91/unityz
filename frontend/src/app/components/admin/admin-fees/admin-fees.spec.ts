import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AdminFeesComponent } from './admin-fees';
import { FeeService, GuildFeeOverview } from '../../../services/fee';
import { AuthService } from '../../../services/auth';
import { ConfirmService } from '../../../services/confirm';
import { ToastService } from '../../../services/toast';

describe('AdminFeesComponent', () => {
  let component: AdminFeesComponent;
  let fixture: ComponentFixture<AdminFeesComponent>;

  const mockFeeService = {
    loadPendingDeclarations: () => of([]),
    getGuildOverview: () => of([]),
    resolveDeclaration: () => of(null),
    adjustAllocation: () => of(null),
    sendPaymentReminders: () => of({ notifiedCount: 1, messageSent: true }),
    pendingDeclarations: signal<any[]>([])
  };

  const mockAuthService = {
    currentUser: () => ({ id: 1, active_guild_minimum_fee_amount: 2000 })
  };

  const mockConfirmService = {
    ask: () => Promise.resolve(true)
  };

  const mockToastService = {
    success: () => {},
    error: () => {},
    info: () => {}
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminFeesComponent],
      providers: [
        { provide: FeeService, useValue: mockFeeService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfirmService, useValue: mockConfirmService },
        { provide: ToastService, useValue: mockToastService },
        { provide: HttpClient, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminFeesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should safely handle null allocations when calling getMonthAlloc', () => {
    const userWithNullAllocations = {
      user_id: 'user1',
      battletag: 'TestUser#1234',
      allocations: null as any
    } as GuildFeeOverview;

    const result = component.getMonthAlloc(userWithNullAllocations, 1);
    expect(result).toBeUndefined();
  });

  it('should safely handle null allocations when calling openAdjustModal', () => {
    const userWithNullAllocations = {
      user_id: 'user1',
      battletag: 'TestUser#1234',
      allocations: null as any
    } as GuildFeeOverview;

    expect(() => {
      component.openAdjustModal(userWithNullAllocations, 1);
    }).not.toThrow();
    
    expect(component.adjustingAmount).toBe(0);
  });

  it('should send payment reminders when confirmed', async () => {
    const remindSpy = vi.spyOn(mockFeeService, 'sendPaymentReminders');
    const toastSpy = vi.spyOn(mockToastService, 'success');
    
    await component.onSendReminders();
    
    expect(remindSpy).toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith('Rappels Discord envoyés avec succès (1 membre(s) notifié(s)).');
  });

  it('should show info toast when no late members are found or Discord is unconfigured', async () => {
    vi.spyOn(mockFeeService, 'sendPaymentReminders').mockReturnValue(of({ notifiedCount: 0, messageSent: false }));
    const toastSpy = vi.spyOn(mockToastService, 'info');
    
    await component.onSendReminders();
    
    expect(toastSpy).toHaveBeenCalledWith("Aucun membre en retard trouvé, ou le salon Discord n'est pas configuré.");
  });
});
