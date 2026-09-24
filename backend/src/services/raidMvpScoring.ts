import type { MvpBreakdown, RaidRole, ReportPull } from './wclReportService';

/**
 * Score MVP d'un raid (0 à 100), équitable entre tanks, soigneurs et DPS.
 *
 * Aucun critère ne compare directement un rôle à un autre :
 * - Performance : parse WCL moyen sur les kills. Le percentile est déjà calculé par WCL contre la
 *   même spécialisation (DPS pour les DPS et les tanks, HPS pour les soigneurs).
 * - Apport : sur chaque pull (wipes compris), DPS ou HPS rapporté à la médiane de son rôle dans le
 *   pull. La médiane vaut 50, le double de la médiane 100.
 * - Survie : morts pénalisantes par pull. Sur un wipe, les morts de fin de wipe ne comptent pas.
 * - Préparation : potion de combat sur les pulls significatifs, flacon et nourriture au pull.
 * - Utilité : interruptions + dissipations, rapportées au meilleur de son rôle.
 */

export const MVP_WEIGHTS: Readonly<MvpBreakdown> = {
  performance: 40,
  output: 20,
  survival: 20,
  preparation: 15,
  utility: 5,
};

export const MVP_RULES = {
  /** Part minimale des pulls pour être éligible au titre de MVP. */
  minAttendance: 0.5,
  /** Survie = 100 × (1 − deathPenalty × morts pénalisantes / pulls joués). */
  deathPenalty: 1.5,
  /** Sur un wipe, seules les morts survenues avant que cette part du raid soit tombée comptent. */
  wipeCutoffRatio: 0.25,
  /** En dessous, un wipe n'exige pas de potion de combat (reset rapide). */
  potionMinPullMs: 60_000,
  /** Poids des éléments de préparation. */
  preparation: { potion: 0.6, flask: 0.2, food: 0.2 },
  /** Score d'utilité quand personne du rôle n'a interrompu ni dissipé. */
  neutralUtility: 50,
} as const;

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Marque les morts pénalisantes d'un pull. Sur un kill, toutes comptent. Sur un wipe, le raid
 * s'effondre en cascade : seules les morts antérieures à la chute du N-ième joueur
 * (N = 25 % du raid) comptent, les morts simultanées à ce seuil sont considérées collectives.
 */
export function flagPrematureDeaths<T extends { timestamp: number }>(
  deaths: T[],
  raidSize: number,
  kill: boolean,
): (T & { premature: boolean })[] {
  const sorted = [...deaths].sort((a, b) => a.timestamp - b.timestamp);
  if (kill) return sorted.map((d) => ({ ...d, premature: true }));

  const threshold = Math.max(1, Math.ceil(raidSize * MVP_RULES.wipeCutoffRatio));
  const cutoff = sorted[threshold - 1]?.timestamp ?? Number.POSITIVE_INFINITY;
  return sorted.map((d) => ({ ...d, premature: d.timestamp < cutoff - 1000 }));
}

/** Montant comparé au sein du rôle : HPS pour un soigneur, DPS sinon. */
export const roleAmount = (role: RaidRole, p: { dps: number; hps: number }) =>
  role === 'healer' ? p.hps : p.dps;

export interface ScoringInput {
  actorId: number;
  role: RaidRole;
  interrupts: number;
  dispels: number;
}

export interface ScoringResult {
  score: number;
  breakdown: MvpBreakdown;
  eligible: boolean;
}

/** Calcule le score MVP de chaque joueur à partir des pulls du rapport. */
export function scorePlayers(
  pulls: ReportPull[],
  players: ScoringInput[],
): Map<number, ScoringResult> {
  // Médiane de chaque rôle par pull, calculée une seule fois.
  const medians = new Map<number, Map<RaidRole, number>>();
  for (const pull of pulls) {
    const byRole = new Map<RaidRole, number[]>();
    for (const p of pull.players) {
      const list = byRole.get(p.role) ?? [];
      list.push(roleAmount(p.role, p));
      byRole.set(p.role, list);
    }
    medians.set(pull.id, new Map([...byRole].map(([role, values]) => [role, median(values)])));
  }

  const utilityOf = (p: ScoringInput) => p.interrupts + p.dispels;
  const bestUtilityByRole = new Map<RaidRole, number>();
  for (const p of players) {
    bestUtilityByRole.set(p.role, Math.max(bestUtilityByRole.get(p.role) ?? 0, utilityOf(p)));
  }

  const results = new Map<number, ScoringResult>();
  for (const player of players) {
    const played = pulls
      .map((pull) => ({ pull, me: pull.players.find((p) => p.actorId === player.actorId) }))
      .filter((x): x is { pull: ReportPull; me: ReportPull['players'][number] } => !!x.me);
    if (!played.length) continue;

    // Apport : ratio à la médiane du rôle, pondéré par la durée du pull.
    let weightedRatio = 0;
    let weight = 0;
    for (const { pull, me } of played) {
      const ref = medians.get(pull.id)?.get(me.role) ?? 0;
      if (ref <= 0) continue;
      weightedRatio += (roleAmount(me.role, me) / ref) * pull.durationMs;
      weight += pull.durationMs;
    }
    const output = weight ? clamp(50 * (weightedRatio / weight)) : 0;

    const parses = played.map(({ me }) => me.parse).filter((v): v is number => v !== null);
    const performance = parses.length
      ? parses.reduce((sum, v) => sum + v, 0) / parses.length
      : output;

    const premature = played.filter(({ me }) => me.prematureDeath).length;
    const survival = clamp(100 * (1 - (MVP_RULES.deathPenalty * premature) / played.length));

    const rules = MVP_RULES.preparation;
    const eligiblePotion = played.filter(
      ({ pull }) => pull.kill || pull.durationMs >= MVP_RULES.potionMinPullMs,
    );
    const flaskRate = played.filter(({ me }) => me.flask).length / played.length;
    const foodRate = played.filter(({ me }) => me.food).length / played.length;
    const preparation = eligiblePotion.length
      ? 100 *
        (rules.potion *
          (eligiblePotion.filter(({ me }) => me.combatPotions > 0).length /
            eligiblePotion.length) +
          rules.flask * flaskRate +
          rules.food * foodRate)
      : (100 * (rules.flask * flaskRate + rules.food * foodRate)) / (rules.flask + rules.food);

    const bestUtility = bestUtilityByRole.get(player.role) ?? 0;
    const utility = bestUtility
      ? (100 * utilityOf(player)) / bestUtility
      : MVP_RULES.neutralUtility;

    const breakdown: MvpBreakdown = {
      performance: round1(performance),
      output: round1(output),
      survival: round1(survival),
      preparation: round1(preparation),
      utility: round1(utility),
    };
    const score = (Object.keys(MVP_WEIGHTS) as (keyof MvpBreakdown)[]).reduce(
      (sum, key) => sum + (breakdown[key] * MVP_WEIGHTS[key]) / 100,
      0,
    );

    results.set(player.actorId, {
      score: round1(score),
      breakdown,
      eligible: played.length / pulls.length >= MVP_RULES.minAttendance,
    });
  }
  return results;
}
