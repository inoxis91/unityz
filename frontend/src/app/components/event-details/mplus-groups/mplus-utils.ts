import { CLASS_BUFFS } from '../../../constants/wow';
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

// --- Remplissage automatique ---------------------------------------------------

/** Utilitaires d'un joueur en masque de bits : Furie sanguinaire, rez en combat, un bit par buff. */
const LUST_BIT = 1;
const BREZ_BIT = 2;
const BUFF_BITS = CLASS_BUFFS.map((b, i) => ({
  bit: 4 << i,
  classes: new Set(b.classes.map((c) => CharacterService.getClassId(c))),
}));
const UNKNOWN_CLASS = 'unknown';
/** Garde-fou de la recherche locale (chaque passe améliore strictement le coût). */
const MAX_PASSES = 50;

interface FillPlayer {
  signup: Signup;
  role: RaidRole;
  cls: string;
  utility: number;
  /** Score M+, ou la médiane des scores connus pour un joueur sans score. */
  value: number;
  standby: boolean;
  /** Déjà placé par le manager : ne bouge pas. */
  fixed: boolean;
}

/**
 * Coût lexicographique, du critère le plus important au moins important (chacun ne départage
 * que les égalités du précédent) : remplaçants retenus, Furie sanguinaire et rez en combat
 * manquants, buffs manquants, classes en double, score total retenu (négatif), équilibre des
 * moyennes (somme des carrés : à total égal, minimale quand les moyennes sont proches).
 */
type Cost = [number, number, number, number, number, number];
/**
 * Écart minimal pour qu'un critère départage deux solutions. Pour l'équilibre, rapprocher deux
 * groupes de ±25 points de moyenne ne compte plus : sans ce seuil, la recherche enchaîne des
 * centaines d'échanges pour gagner quelques points.
 */
const TOLERANCE: Cost = [0.5, 0.5, 0.5, 0.5, 0.5, 2 * 25 * 25];

function utilityMask(cls: string): number {
  let mask = (LUST_CLASSES.has(cls) ? LUST_BIT : 0) | (BREZ_CLASSES.has(cls) ? BREZ_BIT : 0);
  for (const b of BUFF_BITS) if (b.classes.has(cls)) mask |= b.bit;
  return mask;
}

/**
 * Coût d'un groupe, éventuellement avec `replacement` à la place du membre `at`. Appelé pour
 * chaque échange évalué, d'où l'absence d'allocation intermédiaire.
 */
function groupCost(members: FillPlayer[], at = -1, replacement?: FillPlayer): Cost {
  const member = (k: number) => (k === at ? replacement! : members[k]);
  let mask = 0;
  let total = 0;
  let duplicates = 0;
  for (let k = 0; k < members.length; k++) {
    const m = member(k);
    mask |= m.utility;
    total += m.value;
    if (m.cls === UNKNOWN_CLASS) continue;
    for (let l = 0; l < k; l++) {
      if (member(l).cls === m.cls) {
        duplicates++;
        break;
      }
    }
  }
  let buffsMissing = 0;
  for (const b of BUFF_BITS) if (!(mask & b.bit)) buffsMissing++;
  const avg = total / (members.length || 1);
  return [
    0,
    Number(!(mask & LUST_BIT)) + Number(!(mask & BREZ_BIT)),
    buffsMissing,
    duplicates,
    0,
    avg * avg,
  ];
}

function playerCost(p: FillPlayer): Cost {
  return [Number(p.standby), 0, 0, 0, -p.value, 0];
}

/** Signe de `sum(next) - sum(prev)` au premier critère qui dépasse sa tolérance. */
function compareCost(next: Cost[], prev: Cost[]): number {
  for (let i = 0; i < TOLERANCE.length; i++) {
    let delta = 0;
    for (const c of next) delta += c[i];
    for (const c of prev) delta -= c[i];
    if (Math.abs(delta) >= TOLERANCE[i]) return delta;
  }
  return 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Places manquantes par rôle pour compléter le groupe, `null` si un rôle est déjà en surnombre. */
function roleNeeds(members: Signup[]): Record<RaidRole, number> | null {
  const needs = { ...ROLE_CAPACITY };
  for (const m of members) {
    const role = m.role as RaidRole;
    if (role in needs && --needs[role] < 0) return null;
  }
  return needs;
}

/**
 * Groupes que les joueurs disponibles peuvent compléter, les plus avancés d'abord : on ne
 * disperse pas des joueurs dans un groupe qui restera sans tank ou sans heal.
 */
function completableGroups(groups: MplusGroup[], available: Record<RaidRole, number>) {
  const left = { ...available };
  const targets: { group: MplusGroup; needs: Record<RaidRole, number> }[] = [];
  const byProgress = [...groups].sort(
    (a, b) => b.members.length - a.members.length || a.index - b.index,
  );
  for (const group of byProgress) {
    const needs = roleNeeds(group.members);
    if (!needs || MPLUS_ROLES.every((r) => !needs[r])) continue;
    if (MPLUS_ROLES.some((r) => needs[r] > left[r])) continue;
    for (const r of MPLUS_ROLES) left[r] -= needs[r];
    targets.push({ group, needs });
  }
  return targets.sort((a, b) => a.group.index - b.group.index);
}

/**
 * Recherche locale : échange deux joueurs de même rôle entre deux groupes, ou un joueur placé
 * avec un joueur resté sans groupe, dès que le coût s'améliore, jusqu'à une passe sans gain.
 */
function improve(groups: FillPlayer[][], bench: FillPlayer[]): void {
  const costs = groups.map((members) => groupCost(members));
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let g = 0; g < groups.length; g++) {
      for (let i = 0; i < groups[g].length; i++) {
        if (groups[g][i].fixed) continue;
        for (let h = g + 1; h < groups.length; h++) {
          for (let j = 0; j < groups[h].length; j++) {
            const a = groups[g][i];
            const b = groups[h][j];
            if (b.fixed || b.role !== a.role) continue;
            const costG = groupCost(groups[g], i, b);
            const costH = groupCost(groups[h], j, a);
            if (compareCost([costG, costH], [costs[g], costs[h]]) >= 0) continue;
            [groups[g][i], groups[h][j], costs[g], costs[h]] = [b, a, costG, costH];
            improved = true;
          }
        }
        for (let k = 0; k < bench.length; k++) {
          const a = groups[g][i];
          const b = bench[k];
          if (b.role !== a.role) continue;
          const cost = groupCost(groups[g], i, b);
          if (compareCost([cost, playerCost(b)], [costs[g], playerCost(a)]) >= 0) continue;
          [groups[g][i], bench[k], costs[g]] = [b, a, cost];
          improved = true;
        }
      }
    }
    if (!improved) return;
  }
}

/**
 * Complète les groupes existants avec les joueurs sans groupe, sans déplacer ceux déjà placés.
 * Seuls les groupes que les joueurs disponibles peuvent compléter (1 tank, 1 heal, 3 DPS) sont
 * remplis. Les titulaires passent avant les remplaçants, puis, par ordre de priorité :
 * une Furie sanguinaire et une rez en combat par groupe, un maximum de buffs, des classes
 * différentes, les meilleurs scores M+ retenus, et enfin des moyennes de score équilibrées.
 */
export function autoFill(groups: MplusGroup[], pool: Signup[], score: ScoreFn): GroupAssignment[] {
  const knownScores = [...groups.flatMap((g) => g.members), ...pool]
    .map(score)
    .filter((v): v is number => !!v);
  const fallback = median(knownScores);
  const toPlayer = (s: Signup, fixed: boolean): FillPlayer => {
    const cls = classId(s);
    return {
      signup: s,
      role: s.role as RaidRole,
      cls,
      utility: utilityMask(cls),
      value: score(s) || fallback,
      standby: s.status === 'standby',
      fixed,
    };
  };

  const candidates = pool
    .filter((p) => p.role in ROLE_CAPACITY)
    .map((p) => toPlayer(p, false))
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        Number(a.standby) - Number(b.standby) ||
        b.value - a.value ||
        (signupDisplayName(a.signup) ?? '').localeCompare(signupDisplayName(b.signup) ?? ''),
    );
  const available: Record<RaidRole, number> = { tank: 0, heal: 0, dps: 0 };
  for (const p of candidates) available[p.role]++;
  const targets = completableGroups(groups, available);
  if (!targets.length) return [];

  // Solution de départ : titulaires et meilleurs scores d'abord, chacun dans le groupe le plus
  // faible qui a encore besoin de son rôle. La recherche locale applique ensuite les priorités.
  const members = targets.map((t) => t.group.members.map((m) => toPlayer(m, true)));
  const free = targets.map((t) => ({ ...t.needs }));
  const avg = (i: number) =>
    members[i].reduce((sum, m) => sum + m.value, 0) / (members[i].length || 1);
  const bench: FillPlayer[] = [];
  for (const p of candidates) {
    const target = targets
      .map((_, i) => i)
      .filter((i) => free[i][p.role] > 0)
      .sort((i, j) => avg(i) - avg(j) || i - j)[0];
    if (target === undefined) {
      bench.push(p);
      continue;
    }
    free[target][p.role]--;
    members[target].push(p);
  }

  improve(members, bench);
  return members.flatMap((group, i) =>
    group
      .filter((p) => !p.fixed)
      .map((p) => ({ user_id: p.signup.user_id, group_index: targets[i].group.index })),
  );
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
