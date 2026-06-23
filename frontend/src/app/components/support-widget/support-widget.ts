import { Component, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-support-widget',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './support-widget.html',
  styleUrls: ['./support-widget.css'],
})
export class SupportWidgetComponent {
  public i18n = inject(I18nService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);

  // UI state signals
  isOpen = signal<boolean>(false);
  activeForm = signal<'none' | 'bug' | 'contact'>('none');
  isSubmitting = signal<boolean>(false);

  // Form model signals - Bug Report
  bugName = signal<string>('');
  bugEmail = signal<string>('');
  bugSubject = signal<string>('');
  bugDesc = signal<string>('');
  bugSeverity = signal<'low' | 'medium' | 'high' | 'critical'>('medium');

  // Form model signals - Contact Form
  contactName = signal<string>('');
  contactEmail = signal<string>('');
  contactSubject = signal<string>('');
  contactMessage = signal<string>('');

  toggleWidget() {
    this.isOpen.update((val) => !val);
  }

  openForm(type: 'bug' | 'contact') {
    this.activeForm.set(type);
    this.isOpen.set(false);
  }

  closeForm() {
    this.activeForm.set('none');
    this.resetForms();
  }

  resetForms() {
    this.bugName.set('');
    this.bugEmail.set('');
    this.bugSubject.set('');
    this.bugDesc.set('');
    this.bugSeverity.set('medium');

    this.contactName.set('');
    this.contactEmail.set('');
    this.contactSubject.set('');
    this.contactMessage.set('');
  }

  submitBug() {
    if (!this.bugName() || !this.bugEmail() || !this.bugSubject() || !this.bugDesc()) {
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      name: this.bugName(),
      email: this.bugEmail(),
      subject: this.bugSubject(),
      description: this.bugDesc(),
      severity: this.bugSeverity(),
    };

    this.http.post(`${environment.apiUrl}/support/bug`, payload).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('support.msg.success.bug'));
        this.isSubmitting.set(false);
        this.closeForm();
      },
      error: () => {
        this.toast.error(this.i18n.t('support.msg.error'));
        this.isSubmitting.set(false);
      },
    });
  }

  submitContact() {
    if (
      !this.contactName() ||
      !this.contactEmail() ||
      !this.contactSubject() ||
      !this.contactMessage()
    ) {
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      name: this.contactName(),
      email: this.contactEmail(),
      subject: this.contactSubject(),
      message: this.contactMessage(),
    };

    this.http.post(`${environment.apiUrl}/support/contact`, payload).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('support.msg.success.contact'));
        this.isSubmitting.set(false);
        this.closeForm();
      },
      error: () => {
        this.toast.error(this.i18n.t('support.msg.error'));
        this.isSubmitting.set(false);
      },
    });
  }
}
