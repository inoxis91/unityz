import {
  MVP_CRITERIA,
  MvpBreakdown,
  MvpCriterion,
  RaidLogRole,
  ReportPlayer,
} from '../../../services/raid-logs';

/** Fonctions pures dérivées de l'analyse (distinctions, champions, rattachement aux personnages). */

export const ROLES: readonly RaidLogRole[] = ['tank', 'healer', 'dps'];

export const ROLE_ICONS: Record<RaidLogRole, string> = {
  tank: 'assets/icons/tank.png',
  healer: 'assets/icons/heal.png',
  dps: 'assets/icons/dps.png',
};

export type AwardKey =
  | 'best_parse'
  | 'top_dps'
  | 'top_hps'
  | 'survivor'
  | 'most_deaths'
  | 'potions'
  | 'interrupts'
  | 'dispels';

export interface Award {
  key: AwardKey;
  icon: string;
  player: ReportPlayer;
  value: number;
  /** Clé i18n de l'unité affichée sous la valeur. */
  unit: string;
  /** Valeur exprimée en percentile WCL (coloration par palier). */
  isParse?: boolean;
}

/** Clé nom + royaume insensible à la casse, aux espaces et aux apostrophes (`Khaz Modan` = `KhazModan`). */
export function characterKey(name: string, realm: string | null | undefined): string {
  return `${name.toLocaleLowerCase()}|${(realm ?? '').toLocaleLowerCase().replace(/[^\p{L}]/gu, '')}`;
}

/** Joueurs du rapport correspondant aux personnages de l'utilisateur (nom + royaume, sinon nom seul). */
export function matchMyPlayers(
  players: ReportPlayer[],
  characters: { name: string; realm?: string | null }[],
): Set<number> {
  const exact = new Set(characters.map((c) => characterKey(c.name, c.realm)));
  const names = new Set(characters.map((c) => c.name.toLocaleLowerCase()));
  const byName = new Map<string, number>();
  for (const p of players) {
    const name = p.name.toLocaleLowerCase();
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  return new Set(
    players
      .filter(
        (p) =>
          exact.has(characterKey(p.name, p.server)) ||
          // Royaume absent ou libellé différent : le nom suffit s'il est unique dans le rapport.
          (names.has(p.name.toLocaleLowerCase()) && byName.get(p.name.toLocaleLowerCase()) === 1),
      )
      .map((p) => p.actorId),
  );
}

/** Meilleur joueur éligible de chaque rôle (les joueurs sont déjà triés par rang). */
export function roleChampions(players: ReportPlayer[]): Record<RaidLogRole, ReportPlayer | null> {
  const eligible = players.filter((p) => p.eligible);
  return {
    tank: eligible.find((p) => p.role === 'tank') ?? null,
    healer: eligible.find((p) => p.role === 'healer') ?? null,
    dps: eligible.find((p) => p.role === 'dps') ?? null,
  };
}

function best(
  players: ReportPlayer[],
  value: (p: ReportPlayer) => number | null,
  tieBreak: (p: ReportPlayer) => number = (p) => -p.rank,
): ReportPlayer | null {
  let winner: ReportPlayer | null = null;
  for (const p of players) {
    const v = value(p);
    if (v === null) continue;
    const w = winner ? value(winner)! : null;
    if (w === null || v > w || (v === w && tieBreak(p) > tieBreak(winner!))) winner = p;
  }
  return winner;
}

/** Distinctions du raid. Seules les distinctions avec un lauréat significatif sont retournées. */
export function computeAwards(players: ReportPlayer[]): Award[] {
  const eligible = players.filter((p) => p.eligible);
  const awards: Award[] = [];
  const push = (award: Omit<Award, 'player' | 'value'>, player: ReportPlayer | null, value = 0) => {
    if (player) awards.push({ ...award, player, value });
  };

  const parse = best(eligible, (p) => p.avgParse);
  push(
    { key: 'best_parse', icon: '🎯', unit: 'logs.unit.avg_parse', isParse: true },
    parse,
    parse?.avgParse ?? 0,
  );

  const dps = best(
    eligible.filter((p) => p.role === 'dps'),
    (p) => p.dps,
  );
  push({ key: 'top_dps', icon: '⚔️', unit: 'logs.unit.dps' }, dps, dps?.dps ?? 0);

  const hps = best(
    eligible.filter((p) => p.role === 'healer'),
    (p) => p.hps,
  );
  push({ key: 'top_hps', icon: '💚', unit: 'logs.unit.hps' }, hps, hps?.hps ?? 0);

  // Increvable : le moins de morts pénalisantes, puis le moins de morts au total, puis le plus de pulls.
  const survivor = best(
    eligible,
    (p) => -p.prematureDeaths,
    (p) => -p.deaths * 1000 + p.pulls,
  );
  push(
    { key: 'survivor', icon: '🛡️', unit: 'logs.unit.premature_deaths' },
    survivor,
    survivor?.prematureDeaths ?? 0,
  );

  const deaths = best(
    players.filter((p) => p.prematureDeaths > 0),
    (p) => p.prematureDeaths,
    (p) => p.deaths,
  );
  push(
    { key: 'most_deaths', icon: '💀', unit: 'logs.unit.premature_deaths' },
    deaths,
    deaths?.prematureDeaths ?? 0,
  );

  const potions = best(
    players.filter((p) => p.combatPotions > 0),
    (p) => p.combatPotions,
  );
  push(
    { key: 'potions', icon: '🧪', unit: 'logs.unit.potions' },
    potions,
    potions?.combatPotions ?? 0,
  );

  const kicks = best(
    players.filter((p) => p.interrupts > 0),
    (p) => p.interrupts,
  );
  push(
    { key: 'interrupts', icon: '✋', unit: 'logs.unit.interrupts' },
    kicks,
    kicks?.interrupts ?? 0,
  );

  const dispels = best(
    players.filter((p) => p.dispels > 0),
    (p) => p.dispels,
  );
  push({ key: 'dispels', icon: '✨', unit: 'logs.unit.dispels' }, dispels, dispels?.dispels ?? 0);

  return awards;
}

export type PotionStatus = 'full' | 'partial' | 'none' | 'na';

/** Régularité des potions de combat sur les pulls significatifs. */
export function potionStatus(player: ReportPlayer): PotionStatus {
  if (!player.potionEligiblePulls) return 'na';
  if (player.potionPulls === 0) return 'none';
  return player.potionPulls / player.potionEligiblePulls >= 0.8 ? 'full' : 'partial';
}

/** Points rapportés par chaque critère (valeur du critère × poids). La somme vaut le score. */
export function contributions(
  breakdown: MvpBreakdown,
  weights: MvpBreakdown,
): { criterion: MvpCriterion; points: number; value: number; weight: number }[] {
  return MVP_CRITERIA.map((criterion) => ({
    criterion,
    value: breakdown[criterion],
    weight: weights[criterion],
    points: (breakdown[criterion] * weights[criterion]) / 100,
  }));
}
