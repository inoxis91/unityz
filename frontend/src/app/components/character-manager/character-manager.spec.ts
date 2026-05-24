import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CharacterManager } from './character-manager';

describe('CharacterManager', () => {
  let component: CharacterManager;
  let fixture: ComponentFixture<CharacterManager>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterManager],
    }).compileComponents();

    fixture = TestBed.createComponent(CharacterManager);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
