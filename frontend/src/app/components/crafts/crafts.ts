import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CraftService, CraftRequest } from '../../services/craft';
import { I18nService } from '../../services/i18n';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-crafts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './crafts.html',
  styleUrl: './crafts.css'
})
export class CraftsComponent implements OnInit {
  public craftService = inject(CraftService);
  public i18n = inject(I18nService);
  private toast = inject(ToastService);

  activeTab = signal<'make_request' | 'pending_requests'>('pending_requests');

  // Request form state
  selectedSlot = signal<string>('');
  selectedArmorType = signal<string>('');
  isSaving = signal<boolean>(false);

  // WoW Slots
  slots = [
    { value: 'head', label: 'Tête / Head' },
    { value: 'neck', label: 'Cou / Neck' },
    { value: 'shoulders', label: 'Épaules / Shoulders' },
    { value: 'back', label: 'Dos / Back' },
    { value: 'chest', label: 'Torse / Chest' },
    { value: 'wrists', label: 'Poignets / Wrists' },
    { value: 'hands', label: 'Mains / Hands' },
    { value: 'waist', label: 'Taille / Waist' },
    { value: 'legs', label: 'Jambes / Legs' },
    { value: 'feet', label: 'Pieds / Feet' },
    { value: 'finger', label: 'Anneau / Finger' },
    { value: 'trinket', label: 'Bijou / Trinket' },
    { value: 'weapon', label: 'Arme / Weapon' },
    { value: 'offhand', label: 'Bouclier & Main gauche / Shield & Off-hand' }
  ];

  // Armor Types
  armorTypes = [
    { value: 'cloth', label: 'Tissu / Cloth' },
    { value: 'leather', label: 'Cuir / Leather' },
    { value: 'mail', label: 'Mailles / Mail' },
    { value: 'plate', label: 'Plaques / Plate' },
    { value: 'other', label: 'Autre / Divers (Bijoux, Armes, etc.)' }
  ];

  ngOnInit() {
    this.craftService.loadPendingRequests().subscribe({
      error: (err) => console.error('Error loading craft requests:', err)
    });
  }

  getSlotLabel(value: string): string {
    const slot = this.slots.find(s => s.value === value);
    if (!slot) return value;
    // Map to nice localized label
    return this.i18n.t(`crafts.slots.${value}`) || slot.label;
  }

  getArmorTypeLabel(value: string): string {
    const type = this.armorTypes.find(t => t.value === value);
    if (!type) return value;
    // Map to nice localized label
    return this.i18n.t(`crafts.armor_types.${value}`) || type.label;
  }

  onSubmitRequest() {
    const slot = this.selectedSlot();
    const armorType = this.selectedArmorType();

    if (!slot || !armorType) {
      this.toast.error(this.i18n.t('crafts.toast.validation_error'));
      return;
    }

    this.isSaving.set(true);
    this.craftService.createRequest(slot, armorType).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('crafts.toast.create_success'));
        this.selectedSlot.set('');
        this.selectedArmorType.set('');
        this.isSaving.set(false);
        this.activeTab.set('pending_requests');
      },
      error: (err) => {
        console.error('Error creating craft request:', err);
        this.toast.error(this.i18n.t('crafts.toast.create_error'));
        this.isSaving.set(false);
      }
    });
  }

  onCompleteRequest(req: CraftRequest) {
    this.craftService.completeRequest(req.id).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('crafts.toast.complete_success'));
      },
      error: (err) => {
        console.error('Error completing craft request:', err);
        this.toast.error(this.i18n.t('crafts.toast.complete_error'));
      }
    });
  }
}
