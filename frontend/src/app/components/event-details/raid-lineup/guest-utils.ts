import { EventGuest, RaidRole, Signup } from '../../../services/calendar';
import { wowClassRoles } from '../../../constants/wow';

export const GUEST_NAME_MAX = 40;
export const GUEST_NOTE_MAX = 500;

/** Même règle que le backend : lettres (accents compris), espaces, apostrophes, tirets. */
const GUEST_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' -]*$/u;

/** Préfixe des clés de carte : un invité ne peut pas entrer en collision avec un `user_id`. */
const GUEST_KEY_PREFIX = 'guest:';

/**
 * Carte de line-up d'un invité : la forme d'une inscription, pour partager tri, buffs,
 * compteurs et drag & drop avec les membres. La note devient le commentaire affiché.
 */
export function guestToSignup(g: EventGuest): Signup {
  return {
    id: g.id,
    event_id: g.event_id,
    user_id: GUEST_KEY_PREFIX + g.id,
    character_id: null,
    role: g.role,
    status: 'signed_up',
    group_index: 0,
    comment: g.note,
    selection: g.selection,
    assigned_role: null,
    created_at: g.created_at,
    updated_at: g.created_at,
    character_name: g.name,
    character_class: g.class,
    guest: g,
  };
}

/** Modifications à fusionner dans la liste des invités (optimiste, confirmé ou rollback). */
export interface GuestChange {
  upsert?: EventGuest[];
  remove?: string[];
}

export function applyGuestChange(list: EventGuest[], change: GuestChange): EventGuest[] {
  const removed = new Set(change.remove ?? []);
  const next = list.filter((g) => !removed.has(g.id));
  for (const guest of change.upsert ?? []) {
    const index = next.findIndex((g) => g.id === guest.id);
    if (index === -1) next.push(guest);
    else next[index] = guest;
  }
  return next;
}

/** Espaces superflus retirés, comme le `trim()` du backend. */
export function normalizeGuestName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isValidGuestName(name: string): boolean {
  return name.length >= 2 && name.length <= GUEST_NAME_MAX && GUEST_NAME_RE.test(name);
}

/** Garde le rôle s'il est jouable par la classe, sinon le premier rôle possible (DPS pour les classes pures). */
export function fitRoleToClass(className: string, role: RaidRole | null): RaidRole | null {
  const roles = wowClassRoles(className);
  if (role && roles.includes(role)) return role;
  return roles.length === 1 ? roles[0] : null;
}
