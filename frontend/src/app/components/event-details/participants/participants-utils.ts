import { CalendarEvent, RaidRole, Signup } from '../../../services/calendar';
import { Character } from '../../../services/character';
import { Roster } from '../../../services/roster';

export type SignupStatus = 'signed_up' | 'standby' | 'absent';
export type SortMethod = 'date' | 'status';
export type SortDirection = 'asc' | 'desc';

const STATUS_ORDER: Record<string, number> = { signed_up: 1, standby: 2, absent: 3 };

function signupTime(s: Pick<Signup, 'updated_at' | 'signup_date' | 'created_at'>): number {
  return new Date(s.updated_at || s.signup_date || s.created_at || 0).getTime() || 0;
}

/** Tri par date de dernière réponse, ou par statut (présents, peut-être, absents) puis date. */
export function sortSignups<T extends Signup>(
  signups: T[],
  method: SortMethod,
  direction: SortDirection,
): T[] {
  const list = [...signups];
  if (method === 'date') {
    const sign = direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => sign * (signupTime(a) - signupTime(b)));
  }
  return list.sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      signupTime(a) - signupTime(b),
  );
}

/**
 * Un événement restreint à un roster accepte les personnages de ce roster ou d'un roster de poids
 * inférieur ou égal (plus prioritaire). Sans roster, tout le monde peut s'inscrire.
 */
export function isCharacterAllowed(
  char: Pick<Character, 'roster_id'>,
  event: Pick<CalendarEvent, 'roster_id' | 'roster_weight'> | null,
  rosters: Pick<Roster, 'id' | 'weight'>[],
): boolean {
  if (!event?.roster_id) return true;
  if (!char.roster_id) return false;
  const targetWeight = event.roster_weight || 999;
  const roster = rosters.find((r) => r.id === char.roster_id);
  return roster ? roster.weight <= targetWeight : false;
}

/** Rôle proposé par défaut pour un personnage : tank, puis heal, sinon DPS. */
export function defaultRoleFor(char: Pick<Character, 'is_tank' | 'is_heal'> | undefined): RaidRole {
  if (char?.is_tank) return 'tank';
  if (char?.is_heal) return 'heal';
  return 'dps';
}

/** Nom affiché : personnage inscrit (ou main pour un absent), à défaut le BattleTag. */
export function signupDisplayName(s: Signup, fallback: string): string {
  const battletagName = s.battletag?.split('#')[0];
  if (s.status === 'absent') return s.main_character_name || battletagName || fallback;
  return s.character_name || s.main_character_name || battletagName || fallback;
}

export function signupClass(s: Signup): string | undefined {
  return s.status === 'absent'
    ? s.main_character_class
    : s.character_class || s.main_character_class;
}

export interface SignupCounts {
  signed_up: number;
  standby: number;
  absent: number;
  tank: number;
  heal: number;
  dps: number;
}

/** Compteurs par statut, et par rôle effectif parmi les présents et « peut-être ». */
export function countSignups(signups: Signup[], roleOf: (s: Signup) => RaidRole): SignupCounts {
  const counts: SignupCounts = { signed_up: 0, standby: 0, absent: 0, tank: 0, heal: 0, dps: 0 };
  for (const s of signups) {
    if (s.status === 'signed_up' || s.status === 'standby' || s.status === 'absent') {
      counts[s.status]++;
    }
    if (s.status !== 'absent') {
      const role = roleOf(s);
      if (role in counts) counts[role]++;
    }
  }
  return counts;
}
