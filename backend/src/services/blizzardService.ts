import axios from 'axios';

export class BlizzardService {
  private static readonly REGION = 'eu';
  private static readonly LOCALE = 'fr_FR';
  private static readonly PROFILE_NAMESPACE = 'profile-eu';

  static async getCharacterMedia(accessToken: string, realm: string, characterName: string) {
    const realmSlug = this.formatRealmSlug(realm);
    const charNameSlug = this.formatCharSlug(characterName);
    const url = `https://${this.REGION}.api.blizzard.com/profile/wow/character/${realmSlug}/${charNameSlug}/character-media`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { namespace: this.PROFILE_NAMESPACE, locale: this.LOCALE }
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Media Error [${characterName}-${realm}]: ${error.response?.status} - ${error.response?.data?.detail || error.message}`);
      return null;
    }
  }

  static async getCharacterEquipment(accessToken: string, realm: string, characterName: string) {
    const realmSlug = this.formatRealmSlug(realm);
    const charNameSlug = this.formatCharSlug(characterName);
    const url = `https://${this.REGION}.api.blizzard.com/profile/wow/character/${realmSlug}/${charNameSlug}/equipment`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { namespace: this.PROFILE_NAMESPACE, locale: this.LOCALE }
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Equipment Error [${characterName}-${realm}]: ${error.response?.status}`);
      return null;
    }
  }

  static async getCharacterSummary(accessToken: string, realm: string, characterName: string) {
    const realmSlug = this.formatRealmSlug(realm);
    const charNameSlug = this.formatCharSlug(characterName);
    const url = `https://${this.REGION}.api.blizzard.com/profile/wow/character/${realmSlug}/${charNameSlug}`;
    
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { namespace: this.PROFILE_NAMESPACE, locale: this.LOCALE }
      });
      return response.data;
    } catch (error: any) {
      console.error(`[Blizzard API] Summary Error [${characterName}-${realm}]: ${error.response?.status}`);
      return null;
    }
  }

  private static formatRealmSlug(text: string): string {
    return text.toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, "") // Supprime les accents pour les royaumes
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private static formatCharSlug(text: string): string {
    // Pour les noms de personnages, on garde les caractères spéciaux/accents
    // Mais on met en minuscule pour l'URL
    return text.toLowerCase().trim();
  }
}
