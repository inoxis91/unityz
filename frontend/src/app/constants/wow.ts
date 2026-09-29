export interface BuffInfo {
  id: string;
  label: string;
  description: string;
  icon: string; // URL path to the image
  classes: string[];
}

export const CLASS_BUFFS: BuffInfo[] = [
  {
    id: 'intellect',
    label: 'Intelligence',
    description: '3% Intelligence',
    icon: 'assets/icons/class/mage.webp',
    classes: ['Mage']
  },
  {
    id: 'attack_power',
    label: 'Puissance d\'attaque',
    description: '5% Puissance d\'attaque',
    icon: 'assets/icons/class/warrior.webp',
    classes: ['Guerrier']
  },
  {
    id: 'stamina',
    label: 'Endurance',
    description: '5% Endurance',
    icon: 'assets/icons/class/priest.webp',
    classes: ['Prêtre']
  },
  {
    id: 'physical_damage',
    label: 'Dégâts physiques',
    description: '5% Dégâts physiques',
    icon: 'assets/icons/class/monk.webp',
    classes: ['Moine']
  },
  {
    id: 'magic_damage',
    label: 'Dégâts magiques',
    description: '3% Dégâts magiques',
    icon: 'assets/icons/class/dh.webp',
    classes: ['Chasseur de démons']
  },
  {
    id: 'damage_reduction',
    label: 'Réduction de dégâts',
    description: '3% de réduction de dégâts',
    icon: 'assets/icons/class/paladin.webp',
    classes: ['Paladin']
  },
  {
    id: 'versatility',
    label: 'Polyvalence',
    description: '3% de Polyvalence',
    icon: 'assets/icons/class/drood.webp',
    classes: ['Druide']
  },
  {
    id: 'movement_speed',
    label: 'Vitesse de déplacement',
    description: 'Vitesse de déplacement',
    icon: 'assets/icons/class/evoker.webp',
    classes: ['Évocateur']
  },
  {
    id: 'mastery',
    label: 'Maîtrise',
    description: '3% de Maîtrise',
    icon: 'assets/icons/class/shaman.webp',
    classes: ['Chaman']
  },
  {
    id: 'misdirection',
    label: 'Détournement / 3% dégâts',
    description: 'Détournement / 3% dégâts',
    icon: 'assets/icons/class/hunt.webp',
    classes: ['Chasseur']
  }
];

export type WowRaidRole = 'tank' | 'heal' | 'dps';

/** Classe jouable : nom Blizzard fr_FR (comme `characters.class`), identifiant CSS/i18n, rôles possibles. */
export interface WowClass {
  name: string;
  id: string;
  roles: readonly WowRaidRole[];
}

/** Miroir de `WOW_CLASS_ROLES` (backend/src/lib/wowClasses.ts). */
export const WOW_CLASSES: readonly WowClass[] = [
  { name: 'Guerrier', id: 'warrior', roles: ['tank', 'dps'] },
  { name: 'Paladin', id: 'paladin', roles: ['tank', 'heal', 'dps'] },
  { name: 'Chevalier de la mort', id: 'death-knight', roles: ['tank', 'dps'] },
  { name: 'Chasseur de démons', id: 'demon-hunter', roles: ['tank', 'dps'] },
  { name: 'Druide', id: 'druid', roles: ['tank', 'heal', 'dps'] },
  { name: 'Moine', id: 'monk', roles: ['tank', 'heal', 'dps'] },
  { name: 'Prêtre', id: 'priest', roles: ['heal', 'dps'] },
  { name: 'Chaman', id: 'shaman', roles: ['heal', 'dps'] },
  { name: 'Évocateur', id: 'evoker', roles: ['heal', 'dps'] },
  { name: 'Mage', id: 'mage', roles: ['dps'] },
  { name: 'Démoniste', id: 'warlock', roles: ['dps'] },
  { name: 'Chasseur', id: 'hunter', roles: ['dps'] },
  { name: 'Voleur', id: 'rogue', roles: ['dps'] },
];

export function wowClassRoles(className: string | undefined): readonly WowRaidRole[] {
  return WOW_CLASSES.find((c) => c.name === className)?.roles ?? [];
}
