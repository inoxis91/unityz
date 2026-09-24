import { GuildCharacterOverview } from '../../services/character';

export type DirectoryScope = 'mains' | 'alts' | 'all';
export type Role = 'tank' | 'heal' | 'dps' | 'none';

export interface DirectoryFilter {
  scope: DirectoryScope;
  query: string;
  classId: string | null;
}

/** Normalise pour une recherche insensible à la casse et aux accents. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filterCharacters(
  chars: GuildCharacterOverview[],
  filter: DirectoryFilter,
  classIdOf: (className: string) => string,
  classLabelOf: (classId: string) => string,
): GuildCharacterOverview[] {
  const query = normalize(filter.query);
  return chars.filter((c) => {
    if (filter.scope === 'mains' && !c.is_main) return false;
    if (filter.scope === 'alts' && c.is_main) return false;
    const classId = classIdOf(c.class);
    if (filter.classId && classId !== filter.classId) return false;
    if (!query) return true;
    return [c.name, c.owner_battletag, c.roster_name ?? '', classLabelOf(classId)].some((field) =>
      normalize(field).includes(query),
    );
  });
}

/**
 * Personnages par rôle (un personnage multi-rôles apparaît dans chaque colonne), mains d'abord.
 * `none` regroupe ceux dont aucun rôle n'est renseigné.
 */
export function groupByRole(
  chars: GuildCharacterOverview[],
): Record<Role, GuildCharacterOverview[]> {
  const sort = (list: GuildCharacterOverview[]) =>
    list.sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.name.localeCompare(b.name));
  return {
    tank: sort(chars.filter((c) => c.is_tank)),
    heal: sort(chars.filter((c) => c.is_heal)),
    dps: sort(chars.filter((c) => c.is_dps)),
    none: sort(chars.filter((c) => !c.is_tank && !c.is_heal && !c.is_dps)),
  };
}

/** Répartition par classe, de la plus représentée à la moins représentée. */
export function classDistribution(
  chars: GuildCharacterOverview[],
  classIdOf: (className: string) => string,
): { classId: string; count: number; percent: number }[] {
  const counts = new Map<string, number>();
  for (const c of chars) {
    const id = classIdOf(c.class);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const total = chars.length || 1;
  return [...counts.entries()]
    .map(([classId, count]) => ({ classId, count, percent: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count || a.classId.localeCompare(b.classId));
}
