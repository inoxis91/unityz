export interface BuffInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
  classes: string[];
}

export const CLASS_BUFFS: BuffInfo[] = [
  {
    id: 'intellect',
    label: 'Intelligence',
    description: '3% Intelligence',
    icon: '🧠',
    classes: ['Mage']
  },
  {
    id: 'attack_power',
    label: 'Puissance d\'attaque',
    description: '5% Puissance d\'attaque',
    icon: '⚔️',
    classes: ['Guerrier']
  },
  {
    id: 'stamina',
    label: 'Endurance',
    description: '5% Endurance',
    icon: '🛡️',
    classes: ['Prêtre']
  },
  {
    id: 'physical_damage',
    label: 'Dégâts physiques',
    description: '5% Dégâts physiques',
    icon: '👊',
    classes: ['Moine']
  },
  {
    id: 'magic_damage',
    label: 'Dégâts magiques',
    description: '3% Dégâts magiques',
    icon: '🔮',
    classes: ['Chasseur de démons']
  },
  {
    id: 'damage_reduction',
    label: 'Réduction de dégâts',
    description: '3% de réduction de dégâts',
    icon: '✨',
    classes: ['Paladin']
  },
  {
    id: 'versatility',
    label: 'Polyvalence',
    description: '3% de Polyvalence',
    icon: '🍃',
    classes: ['Druide']
  },
  {
    id: 'movement_speed',
    label: 'Vitesse de déplacement',
    description: 'Vitesse de déplacement',
    icon: '👟',
    classes: ['Évocateur']
  },
  {
    id: 'mastery',
    label: 'Maîtrise',
    description: '3% de Maîtrise',
    icon: '⚡',
    classes: ['Chaman']
  },
  {
    id: 'misdirection',
    label: 'Détournement',
    description: 'Détournement',
    icon: '🎯',
    classes: ['Chasseur']
  }
];
