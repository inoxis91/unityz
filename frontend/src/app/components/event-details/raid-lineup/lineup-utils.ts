import { Signup } from '../../../services/calendar';
import { CharacterService } from '../../../services/character';

/** Nom affiché d'un inscrit : personnage inscrit, sinon main, sinon BattleTag. */
export function signupDisplayName(s: Signup): string | null {
  return s.character_name || s.main_character_name || s.battletag?.split('#')[0] || null;
}

export function signupClassCss(s: Signup): string {
  return 'bg-class-' + CharacterService.getClassId(s.character_class || s.main_character_class);
}

/** Le raid lead a imposé un rôle différent de celui choisi par le joueur. */
export function hasForcedRole(s: Signup): boolean {
  return !!s.assigned_role && s.assigned_role !== s.role;
}
