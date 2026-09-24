import { GroupAssignment, RaidRole, Signup } from '../../../services/calendar';
import { CharacterService } from '../../../services/character';
import { Buff, computeBuffs } from '../raid-buffs/raid-buffs';
import { signupDisplayName } from '../raid-lineup/lineup-utils';

/** Miroir de `MPLUS_*` dans `backend/src/schemas/eventSchemas.ts`. */
export const MPLUS_GROUP_SIZE = 5;
export const MPLUS_MAX_GROUPS = 20;

/** Composition type d'un groupe de donjon : 1 tank, 1 heal, 3 DPS. */
export const SLOT_LAYOUT: readonly RaidRole[] = ['tank', 'heal', 'dps', 'dps', 'dps'];
export const MPLUS_ROLES: readonly RaidRole[] = ['tank', 'heal', 'dps'];
const ROLE_ORDER: Record<RaidRole, number> = { tank: 0, heal: 1, dps: 2 };
const ROLE_CAPACITY: Record<RaidRole, number> = { tank: 1, heal: 1, dps: 3 };

/** Classes apportant Furie sanguinaire / Héroïsme (ou équivalent) et une résurrection en combat. */
const LUST_CLASSES = new Set(['shaman', 'mage', 'hunter', 'evoker']);
const BREZ_CLASSES = new Set(['druid', 'death-knight', 'warlock', 'paladin']);

export type RioTier = 'none' | 'gray' | 'green' | 'blue' | 'purple' | 'orange';

export interface GroupSlot {
  role: RaidRole;
  signup: Signup | null;
  /** Joueur placé sur un emplacement d'un autre rôle (ex. 2e tank). */
  offRole: boolean;
}

export interface MplusGroup {
  index: number;
  members: Signup[];
  slots: GroupSlot[];
  avgScore: number | null;
  hasLust: boolean;
  hasBrez: boolean;
  buffs: Buff[];
  isFull: boolean;
  /** 1 tank, 1 heal, 3 DPS. */
  isComplete: boolean;
}

export type ScoreFn = (s: Signup) => number | null;

export function classId(s: Signup): string {
  return CharacterService.getClassId(s.character_class || s.main_character_class);
}

export function rioKey(s: Signup): string | null {
  const name = s.character_name || s.main_character_name;
  const realm = s.character_realm || s.main_character_realm;
  return name && realm ? `${name}-${realm}`.toLowerCase() : null;
}

/** Paliers de couleur du score Mythique+ (proches de ceux de Raider.io). */
export function rioTier(score: number | null): RioTier {
  if (!score) return 'none';
  if (score >= 3000) return 'orange';
  if (score >= 2500) return 'purple';
  if (score >= 2000) return 'blue';
  if (score >= 1500) return 'green';
  return 'gray';
}

export function byRoleThenScore(score: ScoreFn) {
  return (a: Signup, b: Signup): number =>
    ROLE_ORDER[a.role as RaidRole] - ROLE_ORDER[b.role as RaidRole] ||
    (score(b) ?? 0) - (score(a) ?? 0) ||
    (signupDisplayName(a) ?? '').localeCompare(signupDisplayName(b) ?? '');
}

/**
 * Répartit les membres sur les emplacements 1 tank / 1 heal / 3 DPS. Un joueur sans
 * emplacement de son rôle prend une place libre et est signalé hors rôle.
 */
export function buildSlots(members: Signup[]): GroupSlot[] {
  const slots: GroupSlot[] = SLOT_LAYOUT.map((role) => ({ role, signup: null, offRole: false }));
  const leftovers: Signup[] = [];
  for (const m of members) {
    const slot = slots.find((sl) => !sl.signup && sl.role === m.role);
    if (slot) slot.signup = m;
    else leftovers.push(m);
  }
  for (const m of leftovers) {
    const slot = slots.find((sl) => !sl.signup);
    if (slot) Object.assign(slot, { signup: m, offRole: true });
    else slots.push({ role: m.role as RaidRole, signup: m, offRole: true });
  }
  return slots;
}

export function buildGroup(index: number, members: Signup[], score: ScoreFn): MplusGroup {
  const sorted = [...members].sort(byRoleThenScore(score));
  const scores = sorted.map(score).filter((v): v is number => !!v);
  const classes = new Set(sorted.map(classId));
  const count = (role: RaidRole) => sorted.filter((m) => m.role === role).length;
  return {
    index,
    members: sorted,
    slots: buildSlots(sorted),
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    hasLust: [...classes].some((c) => LUST_CLASSES.has(c)),
    hasBrez: [...classes].some((c) => BREZ_CLASSES.has(c)),
    buffs: computeBuffs(sorted),
    isFull: sorted.length >= MPLUS_GROUP_SIZE,
    isComplete: count('tank') === 1 && count('heal') === 1 && count('dps') === 3,
  };
}

/** Nombre de groupes complets constituables avec les joueurs donnés. */
export function possibleGroups(players: Signup[]): number {
  const n = (role: RaidRole) => players.filter((p) => p.role === role).length;
  return Math.min(n('tank'), n('heal'), Math.floor(n('dps') / ROLE_CAPACITY.dps));
}

/**
 * Remplit les places libres des groupes existants avec les joueurs sans groupe, sans déplacer
 * ceux déjà placés. Rôle par rôle (tanks, heals, puis DPS), le meilleur score restant rejoint
 * le groupe le plus faible qui a encore besoin de ce rôle : les groupes restent équilibrés.
 */
export function autoFill(groups: MplusGroup[], pool: Signup[], score: ScoreFn): GroupAssignment[] {
  const state = groups.map((g) => ({
    index: g.index,
    size: g.members.length,
    // Moyenne sur les joueurs ayant un score, comme celle affichée sur le groupe
    total: g.members.reduce((sum, m) => sum + (score(m) ?? 0), 0),
    scored: g.members.filter((m) => score(m)).length,
    roles: {
      tank: g.members.filter((m) => m.role === 'tank').length,
      heal: g.members.filter((m) => m.role === 'heal').length,
      dps: g.members.filter((m) => m.role === 'dps').length,
    } as Record<RaidRole, number>,
  }));
  const avg = (g: (typeof state)[number]) => (g.scored ? g.total / g.scored : 0);

  const assignments: GroupAssignment[] = [];
  for (const role of MPLUS_ROLES) {
    const candidates = pool
      .filter((p) => p.role === role)
      .sort((a, b) => (score(b) ?? 0) - (score(a) ?? 0));
    for (const player of candidates) {
      const target = state
        .filter((g) => g.size < MPLUS_GROUP_SIZE && g.roles[role] < ROLE_CAPACITY[role])
        .sort((a, b) => avg(a) - avg(b) || a.index - b.index)[0];
      if (!target) break;
      target.size++;
      target.roles[role]++;
      const playerScore = score(player);
      if (playerScore) {
        target.total += playerScore;
        target.scored++;
      }
      assignments.push({ user_id: player.user_id, group_index: target.index });
    }
  }
  return assignments;
}

const ROLE_EMOJI: Record<RaidRole, string> = { tank: '🛡️', heal: '💚', dps: '⚔️' };

/** Texte prêt à coller dans Discord (markdown). */
export function formatForDiscord(
  title: string,
  groups: MplusGroup[],
  labels: { group: (index: number) => string; average: string },
): string {
  const lines = [`**${title}**`];
  for (const g of groups) {
    const header =
      `**${labels.group(g.index)}**` + (g.avgScore ? ` · ${labels.average} ${g.avgScore}` : '');
    const byRole = (role: RaidRole) => {
      const names = g.members.filter((m) => m.role === role).map(signupDisplayName);
      while (names.length < ROLE_CAPACITY[role]) names.push('—');
      return names.join(', ');
    };
    lines.push('', header, MPLUS_ROLES.map((r) => `${ROLE_EMOJI[r]} ${byRole(r)}`).join('  ·  '));
  }
  return lines.join('\n');
}
