/**
 * Slug de royaume ASCII accepté par Warcraft Logs (« Aggra (Português) » → « aggra-portugues »,
 * « Kael'thas » → « kaelthas »). Ne pas utiliser pour l'API Blizzard, qui conserve les accents.
 */
export function toRealmSlug(realm: string): string {
  return realm
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
