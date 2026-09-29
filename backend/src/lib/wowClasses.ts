import type { RaidRole } from '../services/lineupRules';

/**
 * Classes jouables (noms Blizzard fr_FR, comme `characters.class`) et rôles de raid possibles.
 * Miroir de `WOW_CLASS_ROLES` (frontend/src/app/constants/wow.ts).
 */
export const WOW_CLASS_ROLES = {
  Guerrier: ['tank', 'dps'],
  Paladin: ['tank', 'heal', 'dps'],
  Chasseur: ['dps'],
  Voleur: ['dps'],
  Prêtre: ['heal', 'dps'],
  'Chevalier de la mort': ['tank', 'dps'],
  Chaman: ['heal', 'dps'],
  Mage: ['dps'],
  Démoniste: ['dps'],
  Moine: ['tank', 'heal', 'dps'],
  Druide: ['tank', 'heal', 'dps'],
  'Chasseur de démons': ['tank', 'dps'],
  Évocateur: ['heal', 'dps'],
} as const satisfies Record<string, readonly RaidRole[]>;

export type WowClassName = keyof typeof WOW_CLASS_ROLES;

export const WOW_CLASS_NAMES = Object.keys(WOW_CLASS_ROLES) as [WowClassName, ...WowClassName[]];

export function canPlayRole(className: WowClassName, role: RaidRole): boolean {
  return (WOW_CLASS_ROLES[className] as readonly RaidRole[]).includes(role);
}
