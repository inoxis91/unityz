/** URLs des images Warcraft Logs (boss, zones). */

const WCL_ASSETS = 'https://assets.rpglogs.com/img/warcraft';

/** Les rencontres réutilisées d'une ancienne saison ont un préfixe (61762 → 11762) que WCL ignore pour l'icône. */
export const encounterIconUrl = (id: number) =>
  `${WCL_ASSETS}/bosses/${id >= 10_000 ? 10_000 + (id % 10_000) : id}-icon.jpg`;

export const zoneImageUrl = (id: number) => `${WCL_ASSETS}/zones/zone-${id}.png`;
