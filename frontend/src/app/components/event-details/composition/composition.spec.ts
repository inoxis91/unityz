import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompositionComponent } from './composition';
import { I18nService } from '../../../services/i18n';
import { Signup } from '../../../services/calendar';

function signup(user_id: string, role: string, status = 'signed_up'): Signup {
  return {
    id: `s-${user_id}`,
    event_id: 'event-1',
    user_id,
    character_id: null,
    role,
    status,
    group_index: 0,
    comment: null,
    created_at: '',
    updated_at: '',
    character_name: user_id,
    character_class: 'Mage',
  };
}

describe('CompositionComponent', () => {
  let component: CompositionComponent;
  let fixture: ComponentFixture<CompositionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompositionComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key, currentLocale: () => 'fr' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompositionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('signups', [
      signup('tank', 'tank'),
      signup('heal', 'heal'),
      signup('dps', 'dps'),
      signup('maybe', 'dps', 'standby'),
      signup('away', 'heal', 'absent'),
    ]);
    fixture.detectChanges();
  });

  it('lists confirmed players by role', () => {
    const byRole = component.byRole();
    expect(byRole['tank'].map((s) => s.user_id)).toEqual(['tank']);
    expect(byRole['heal'].map((s) => s.user_id)).toEqual(['heal']);
    expect(byRole['dps'].map((s) => s.user_id)).toEqual(['dps']);
    expect(fixture.nativeElement.querySelectorAll('.modern-comp-card')).toHaveLength(3);
  });

  it('opens the characters modal when a player is clicked', () => {
    const opened: Signup[] = [];
    component.openAlts.subscribe((s) => opened.push(s));

    fixture.nativeElement.querySelector('.modern-comp-card').click();

    expect(opened.map((s) => s.user_id)).toEqual(['tank']);
  });
});
