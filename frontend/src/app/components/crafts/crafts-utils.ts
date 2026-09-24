import { CraftRequest } from '../../services/craft';

export interface SlotOption {
  value: string;
  emoji: string;
}

export const CRAFT_SLOTS: readonly SlotOption[] = [
  { value: 'head', emoji: '🪖' },
  { value: 'neck', emoji: '📿' },
  { value: 'shoulders', emoji: '🦺' },
  { value: 'back', emoji: '🧣' },
  { value: 'chest', emoji: '👕' },
  { value: 'wrists', emoji: '⌚' },
  { value: 'hands', emoji: '🧤' },
  { value: 'waist', emoji: '🎗️' },
  { value: 'legs', emoji: '👖' },
  { value: 'feet', emoji: '🥾' },
  { value: 'finger', emoji: '💍' },
  { value: 'trinket', emoji: '🔮' },
  { value: 'weapon', emoji: '⚔️' },
  { value: 'offhand', emoji: '🛡️' },
];

export const ARMOR_TYPES = ['cloth', 'leather', 'mail', 'plate', 'other'] as const;
export const WEAPON_TYPES = ['wand', 'staff', 'onehanded', 'twohanded'] as const;

/** Types proposés pour un emplacement : armes pour « weapon », armures sinon. */
export function typesForSlot(slot: string): readonly string[] {
  return slot === 'weapon' ? WEAPON_TYPES : ARMOR_TYPES;
}

/** Clé i18n du libellé d'un type (armure ou arme). */
export function typeLabelKey(type: string): string {
  return (WEAPON_TYPES as readonly string[]).includes(type)
    ? `crafts.weapon_types.${type}`
    : `crafts.armor_types.${type}`;
}

export function slotEmoji(slot: string): string {
  return CRAFT_SLOTS.find((s) => s.value === slot)?.emoji ?? '🧰';
}

/** Nombre de demandes par type, pour les filtres. */
export function countByType(requests: CraftRequest[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of requests) counts.set(r.armor_type, (counts.get(r.armor_type) ?? 0) + 1);
  return counts;
}
