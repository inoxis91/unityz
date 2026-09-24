import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AdminFeesComponent } from './admin-fees';
import { FeeService, GuildFeeOverview } from '../../../services/fee';
import { AuthService } from '../../../services/auth';
import { ConfirmService } from '../../../services/confirm';
import { ToastService } from '../../../services/toast';
import { I18nService } from '../../../services/i18n';

describe('AdminFeesComponent', () => {
  let component: AdminFeesComponent;
  let fixture: ComponentFixture<AdminFeesComponent>;

  const mockFeeService = {
    loadPendingDeclarations: () => of([]),
    getGuildOverview: () => of([]),
    resolveDeclaration: () => of(null),
    adjustAllocation: () => of(null),
    sendPaymentReminders: () => of({ notifiedCount: 1, messageSent: true }),
    pendingDeclarations: signal<any[]>([]),
  };

  const mockAuthService = {
    currentUser: () => ({ id: 1, active_guild_minimum_fee_amount: 2000 }),
  };

  const mockConfirmService = {
    ask: () => Promise.resolve(true),
  };

  const mockToastService = {
    success: () => {},
    error: () => {},
    info: () => {},
  };

  const mockI18nService = {
    currentLocale: signal('fr'),
    t: (key: string) => {
      const translations: Record<string, string> = {
        'admin.fees.confirm_remind_title': 'Envoyer les rappels',
        'admin.fees.confirm_remind_msg':
          'Voulez-vous envoyer un rappel Discord de cotisation à tous les membres en retard pour le mois en cours ?',
        'admin.fees.toast_remind_success':
          'Rappels Discord envoyés avec succès ({count} membre(s) notifié(s)).',
        'admin.fees.toast_remind_info':
          "Aucun membre en retard trouvé, ou le salon Discord n'est pas configuré.",
        'admin.fees.toast_remind_error': "Erreur lors de l'envoi des rappels.",
      };
      return translations[key] || key;
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminFeesComponent],
      providers: [
        { provide: FeeService, useValue: mockFeeService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfirmService, useValue: mockConfirmService },
        { provide: ToastService, useValue: mockToastService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: HttpClient, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminFeesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should build the overview grid even with null allocations', () => {
    component.guildOverview.set([
      {
        user_id: 'user1',
        battletag: 'TestUser#1234',
        allocations: null as any,
      } as GuildFeeOverview,
    ]);
    const [row] = component.grid();
    expect(row.cells).toHaveLength(12);
    expect(row.cells.every((c) => c.amount === 0 && c.state === 'none')).toBe(true);
    expect(row.total).toBe(0);
  });

  it('should sum allocations per month and classify them against the minimum', () => {
    const year = component.displayYear();
    component.guildOverview.set([
      {
        user_id: 'user1',
        battletag: 'TestUser#1234',
        allocations: [
          { month: `${year}-01-01`, amount: 1000 },
          { month: `${year}-01-01`, amount: 1000 },
          { month: `${year}-02-01`, amount: 2500 },
          { month: `${year}-03-01`, amount: 500 },
        ],
      } as GuildFeeOverview,
    ]);
    const [row] = component.grid();
    expect(row.cells.slice(0, 3).map((c) => [c.amount, c.state])).toEqual([
      [2000, 'paid'],
      [2500, 'donation'],
      [500, 'partial'],
    ]);
    expect(row.paid).toBe(2);
    expect(row.total).toBe(5000);
  });

  it('should open the adjustment modal with the current amount', () => {
    const user = {
      user_id: 'user1',
      battletag: 'TestUser#1234',
      allocations: [],
    } as GuildFeeOverview;
    component.openAdjust(user, 3, 1500);
    expect(component.adjustingAmount).toBe(1500);
    expect(component.modal()).toEqual({ kind: 'adjust', user, month: 3 });
  });

  it('should send payment reminders when confirmed', async () => {
    const remindSpy = vi.spyOn(mockFeeService, 'sendPaymentReminders');
    const toastSpy = vi.spyOn(mockToastService, 'success');

    await component.onSendReminders();

    expect(remindSpy).toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      'Rappels Discord envoyés avec succès (1 membre(s) notifié(s)).',
    );
  });

  it('should show info toast when no late members are found or Discord is unconfigured', async () => {
    vi.spyOn(mockFeeService, 'sendPaymentReminders').mockReturnValue(
      of({ notifiedCount: 0, messageSent: false }),
    );
    const toastSpy = vi.spyOn(mockToastService, 'info');

    await component.onSendReminders();

    expect(toastSpy).toHaveBeenCalledWith(
      "Aucun membre en retard trouvé, ou le salon Discord n'est pas configuré.",
    );
  });
});
