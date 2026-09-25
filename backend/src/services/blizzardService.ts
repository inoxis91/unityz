import axios from 'axios';
import { WOW_REGIONS, WowRegion } from '../lib/regions';

/** Personnage (niveau 10+) d'un compte Battle.net, toutes régions confondues. */
export interface BnetCharacter {
  name: string;
  realm: string;
  realmSlug: string | null;
  class: string;
  level: number;
  region: WowRegion;
}

const MIN_LEVEL = 10;

export class BlizzardService {
  // Noms de classes et de royaumes en français quelle que soit la région : le reste de l'app
  // (buffs, icônes, rosters) s'appuie sur les libellés FR.
  private static readonly LOCALE = 'fr_FR';

  private static apiBase(region: WowRegion) {
    return `https://${region}.api.blizzard.com`;
  }

  private static profileParams(region: WowRegion) {
    return { namespace: `profile-${region}`, locale: this.LOCALE };
  }

  /**
   * Personnages du compte dans chaque région. Un compte sans licence WoW dans une région
   * répond 404 : on l'ignore. Un 401 (jeton expiré) remonte pour déclencher la reconnexion.
   */
  static async getAccountCharacters(accessToken: string): Promise<BnetCharacter[]> {
    const results = await Promise.allSettled(
      WOW_REGIONS.map((region) =>
        axios.get(`${this.apiBase(region)}/profile/user/wow`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: this.profileParams(region),
        }),
      ),
    );

    const characters: BnetCharacter[] = [];
    let failure: any = null;
    let succeeded = 0;
    results.forEach((result, i) => {
      const region = WOW_REGIONS[i];
      if (result.status === 'rejected') {
        const status = result.reason?.response?.status;
        if (status === 401) throw result.reason;
        if (status !== 404) {
          console.error(`[Blizzard API] Account profile Error [${region}]: ${status} - ${result.reason?.message}`);
          failure ??= result.reason;
        }
        return;
      }
      succeeded++;
      for (const account of result.value.data.wow_accounts || []) {
        for (const char of account.characters || []) {
          if (!char.name || (char.level || 0) < MIN_LEVEL) continue;
          characters.push({
            name: char.name,
            realm: char.realm?.name || 'Inconnu',
            realmSlug: char.realm?.slug || null,
            class: char.character_class?.name || char.playable_class?.name || 'Inconnu',
            level: char.level || 0,
            region,
          });
        }
      }
    });

    // Aucune région n'a répondu pour une autre raison qu'un 404 : erreur réelle, pas un compte vide
    if (succeeded === 0 && failure) throw failure;
    return characters;
  }

  static async getCharacterMedia(accessToken: string, region: WowRegion, realm: string, characterName: string) {
    const realmSlug = this.formatRealmSlug(realm);
    const charNameSlug = this.formatCharSlug(characterName);
    const url = `${this.apiBase(region)}/profile/wow/character/${realmSlug}/${charNameSlug}/character-media`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: this.profileParams(region)
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Media Error [${characterName}-${realm}-${region}]: ${error.response?.status} - ${error.response?.data?.detail || error.message}`);
      return null;
    }
  }

  static async getCharacterEquipment(accessToken: string, region: WowRegion, realm: string, characterName: string) {
    const realmSlug = this.formatRealmSlug(realm);
    const charNameSlug = this.formatCharSlug(characterName);
    const url = `${this.apiBase(region)}/profile/wow/character/${realmSlug}/${charNameSlug}/equipment`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: this.profileParams(region)
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Equipment Error [${characterName}-${realm}-${region}]: ${error.response?.status}`);
      return null;
    }
  }

  static async getCharacterSummary(accessToken: string, region: WowRegion, realm: string, characterName: string) {
    const realmSlug = this.formatRealmSlug(realm);
    const charNameSlug = this.formatCharSlug(characterName);
    const url = `${this.apiBase(region)}/profile/wow/character/${realmSlug}/${charNameSlug}`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: this.profileParams(region)
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Summary Error [${characterName}-${realm}] (${url}): ${error.response?.status} - ${error.response?.data?.detail || error.message}`);
      return null;
    }
  }

  static async getGuildRoster(accessToken: string, region: WowRegion, realm: string, guildName: string): Promise<any> {
    const realmSlug = this.formatRealmSlug(realm);
    const guildNameSlug = encodeURIComponent(guildName.toLowerCase().trim().replace(/\s+/g, '-'));
    const url = `${this.apiBase(region)}/data/wow/guild/${realmSlug}/${guildNameSlug}/roster`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: this.profileParams(region)
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Guild Roster Error [${guildName}-${realm}-${region}]: ${error.response?.status} - ${error.response?.data?.detail || error.message}`);
      return null;
    }
  }

  private static formatRealmSlug(text: string): string {
    // Le slug Blizzard d'un royaume conserve les accents (ex: "la-croisade-\u00e9carlate"),
    // il ne faut donc pas les retirer comme pour un slug g\u00e9n\u00e9raliste.
    return encodeURIComponent(
      text.toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
    );
  }

  private static formatCharSlug(text: string): string {
    // Pour les noms de personnages, on garde les caractères spéciaux/accents
    // Mais on met en minuscule et on encode pour l'URL
    return encodeURIComponent(text.toLowerCase().trim());
  }
}
