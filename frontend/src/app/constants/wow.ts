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
