import pool from '../lib/db';

export interface CraftRequest {
  id: string;
  guild_id: string;
  user_id: string;
  slot: string;
  armor_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  battletag?: string;
  main_character_name?: string;
}

export class CraftService {
  static async create(guildId: string, userId: string, slot: string, armorType: string): Promise<CraftRequest> {
    const query = `
      INSERT INTO craft_requests (guild_id, user_id, slot, armor_type, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `;
    const result = await pool.query(query, [guildId, userId, slot, armorType]);
    return result.rows[0];
  }

  static async getPending(guildId: string): Promise<CraftRequest[]> {
    const query = `
      SELECT c.id, c.guild_id, c.user_id, c.slot, c.armor_type, c.status, 
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
    const query = `
      UPDATE craft_requests
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND guild_id = $2 AND status = 'pending'
    `;
    const result = await pool.query(query, [id, guildId]);
    return (result.rowCount ?? 0) > 0;
  }
}
