import pool from '../lib/db';
import { sendDiscordChannelMessageWithResult, reactToDiscordMessage, sendDiscordDM } from '../lib/discord';
import { t, getDiscordLocale } from '../lib/i18n';

export interface CraftRequest {
  id: string;
  guild_id: string;
  user_id: string;
  slot: string;
  armor_type: string;
  status: string;
  discord_message_id?: string | null;
  created_at: string;
  updated_at: string;
  battletag?: string;
  main_character_name?: string;
}

const SLOT_TRANSLATIONS_FR: Record<string, string> = {
  head: 'Tête',
  neck: 'Cou',
  shoulders: 'Épaules',
  back: 'Dos',
  chest: 'Torse',
  wrists: 'Poignets',
  hands: 'Mains',
  waist: 'Taille',
  legs: 'Jambes',
  feet: 'Pieds',
  finger: 'Anneau',
  trinket: 'Bijou',
  weapon: 'Arme',
  offhand: 'Bouclier & Main gauche'
};

const ARMOR_TRANSLATIONS_FR: Record<string, string> = {
  cloth: 'Tissu',
  leather: 'Cuir',
  mail: 'Mailles',
  plate: 'Plaques',
  other: 'Autre / Divers',
  wand: 'Baguette',
  staff: 'Bâton',
  onehanded: 'Arme 1 main',
  twohanded: 'Arme 2 mains'
};

export const getProfessionsForCraft = (slot: string, armorType: string): string[] => {
  const professions: string[] = [];

  // Match based on slot & armorType
  if (armorType === 'leather' || armorType === 'mail') {
    professions.push('leatherworking');
  } else if (armorType === 'plate') {
    professions.push('blacksmithing');
  } else if (armorType === 'cloth' || slot === 'back') {
    professions.push('tailoring');
  }

  if (slot === 'neck' || slot === 'finger') {
    professions.push('jewelcrafting');
  }

  if (slot === 'weapon') {
    if (armorType === 'staff') {
      professions.push('inscription');
    } else if (armorType === 'wand') {
      professions.push('enchanting');
    } else {
      professions.push('blacksmithing', 'engineering', 'inscription');
    }
  }

  if (slot === 'trinket') {
    professions.push('jewelcrafting', 'alchemy', 'engineering');
  }

  if (armorType === 'other') {
    professions.push('alchemy', 'enchanting', 'inscription');
  }

  return professions;
};

export class CraftService {
  static async create(guildId: string, userId: string, slot: string, armorType: string): Promise<CraftRequest> {
    // 1. Insert into database
    const query = `
      INSERT INTO craft_requests (guild_id, user_id, slot, armor_type, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `;
    const result = await pool.query(query, [guildId, userId, slot, armorType]);
    const craft = result.rows[0];

    // 2. Load user and guild details to send Discord notification
    try {
      const userRes = await pool.query(`
        SELECT u.battletag, mc.name as main_character_name
        FROM users u
        LEFT JOIN (
          SELECT DISTINCT ON (user_id) user_id, name 
          FROM characters 
          WHERE is_main = TRUE 
          ORDER BY user_id, updated_at DESC
        ) mc ON u.id = mc.user_id
        WHERE u.id = $1
      `, [userId]);
      const user = userRes.rows[0];

      const guildRes = await pool.query(
        'SELECT discord_enabled, discord_crafts_channel_id, discord_locale FROM guilds WHERE id = $1',
        [guildId]
      );
      const guild = guildRes.rows[0];

      if (guild && guild.discord_enabled && user) {
        const locale = getDiscordLocale(guild);
        const slotLabel = t(locale, `slot.${slot}`);
        const typeLabel = t(locale, `armor.${armorType}`);
        const charName = user.main_character_name || t(locale, 'discord.craft.no_char');
        const btag = user.battletag;

        const requesterText = charName !== t(locale, 'discord.craft.no_char') ? charName : btag;

        // A. Channel Notification
        if (guild.discord_crafts_channel_id) {
          let msg = `${t(locale, 'discord.craft.title')}\n`;
          msg += `${t(locale, 'discord.craft.body', { requesterText })}\n\n`;
          msg += `${t(locale, 'discord.craft.item_label', { slot: slotLabel })}\n`;
          msg += `${t(locale, 'discord.craft.type_label', { type: typeLabel })}\n\n`;
          msg += t(locale, 'discord.craft.footer');

          const messageId = await sendDiscordChannelMessageWithResult(guild.discord_crafts_channel_id, msg);
          if (messageId) {
            await pool.query(
              'UPDATE craft_requests SET discord_message_id = $1 WHERE id = $2',
              [messageId, craft.id]
            );
            craft.discord_message_id = messageId;
          }
        }

        // B. Private Messages (DMs) to matching players with appropriate professions
        const professions = getProfessionsForCraft(slot, armorType);
        if (professions.length > 0) {
          const matchingUsersRes = await pool.query(`
            SELECT DISTINCT u.id, u.discord_id, u.battletag
            FROM users u
            JOIN characters c ON u.id = c.user_id
            WHERE (c.guild_id = $1 OR u.active_guild_id = $1)
              AND u.discord_id IS NOT NULL
              AND u.discord_id <> ''
              AND u.id <> $2
              AND u.professions && $3::VARCHAR[]
          `, [guildId, userId, professions]);

          for (const targetUser of matchingUsersRes.rows) {
            try {
              let dmMsg = `${t(locale, 'discord.craft.dm_title')}\n`;
              dmMsg += `${t(locale, 'discord.craft.dm_body')}\n\n`;
              dmMsg += `• **${t(locale, 'discord.fees.label_member') || 'Membre'} :** ${requesterText}\n`;
              dmMsg += `${t(locale, 'discord.craft.item_label', { slot: slotLabel })}\n`;
              dmMsg += `${t(locale, 'discord.craft.type_label', { type: typeLabel })}\n\n`;
              dmMsg += t(locale, 'discord.craft.footer');

              await sendDiscordDM(targetUser.discord_id, dmMsg);
            } catch (dmErr) {
              console.error(`[Discord] Failed to send craft DM to user ${targetUser.id}:`, dmErr);
            }
          }
        }
      }
    } catch (discordErr) {
      console.error('[Discord] Failed to send craft alert:', discordErr);
    }

    return craft;
  }

  static async getPending(guildId: string): Promise<CraftRequest[]> {
    const query = `
      SELECT c.id, c.guild_id, c.user_id, c.slot, c.armor_type, c.status, c.discord_message_id,
             to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
             u.battletag, mc.name as main_character_name
      FROM craft_requests c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN (
        SELECT DISTINCT ON (user_id) user_id, name 
        FROM characters 
        WHERE is_main = TRUE 
        ORDER BY user_id, updated_at DESC
      ) mc ON c.user_id = mc.user_id
      WHERE c.guild_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at ASC
    `;
    const result = await pool.query(query, [guildId]);
    return result.rows;
  }

  static async complete(id: string, guildId: string): Promise<boolean> {
    // 1. Fetch the request details (specifically discord_message_id) before marking it completed
    const reqRes = await pool.query(
      'SELECT discord_message_id FROM craft_requests WHERE id = $1 AND guild_id = $2 AND status = \'pending\'',
      [id, guildId]
    );
    const request = reqRes.rows[0];

    if (!request) {
      return false;
    }

    // 2. Mark completed in DB
    const query = `
      UPDATE craft_requests
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND guild_id = $2 AND status = 'pending'
    `;
    const result = await pool.query(query, [id, guildId]);
    const success = (result.rowCount ?? 0) > 0;

    // 3. React on Discord if message ID is present
    if (success && request.discord_message_id) {
      try {
        const guildRes = await pool.query(
          'SELECT discord_enabled, discord_crafts_channel_id FROM guilds WHERE id = $1',
          [guildId]
        );
        const guild = guildRes.rows[0];
        if (guild && guild.discord_enabled && guild.discord_crafts_channel_id) {
          await reactToDiscordMessage(guild.discord_crafts_channel_id, request.discord_message_id, '✅');
        }
      } catch (reactErr) {
        console.error('[Discord] Failed to react to craft completion:', reactErr);
      }
    }

    return success;
  }
}
