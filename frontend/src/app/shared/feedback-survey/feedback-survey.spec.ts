import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FeedbackAnswer } from '../../services/analytics';
import { FeedbackSurveyComponent } from './feedback-survey';

function setup(source: 'payment_exit' | 'cancel' = 'payment_exit') {
  TestBed.configureTestingModule({ imports: [FeedbackSurveyComponent] });
  const fixture = TestBed.createComponent(FeedbackSurveyComponent);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const answers: FeedbackAnswer[] = [];
  let dismissed = 0;
  fixture.componentInstance.submitted.subscribe((a) => answers.push(a));
  fixture.componentInstance.dismissed.subscribe(() => dismissed++);
  const submit = () => {
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
  };
  return { fixture, el, answers, submit, dismissed: () => dismissed };
}

describe('FeedbackSurveyComponent', () => {
  it('requires a reason before submitting', () => {
    const { el, answers, submit } = setup();
    submit();
    expect(answers).toEqual([]);
    expect(el.querySelector('.error')).not.toBeNull();
  });

  it('emits the reason and the trimmed comment', () => {
    const { fixture, el, answers, submit } = setup();
    el.querySelectorAll<HTMLInputElement>('.reason input')[3].dispatchEvent(new Event('change'));
    const textarea = el.querySelector('textarea')!;
    textarea.value = '  Il manque le suivi des loots  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    submit();
    expect(answers).toEqual([
      { reason: 'missing_feature', comment: 'Il manque le suivi des loots' },
    ]);
  });

  it('closes on Escape unless a request is running', () => {
    const { fixture, dismissed } = setup('cancel');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dismissed()).toBe(1);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dismissed()).toBe(1);
  });
});
