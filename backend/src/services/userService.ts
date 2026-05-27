import pool from '../lib/db';

export interface User {
  id: string;
  battletag: string;
  bnet_id: number;
  discord_id: string | null;
  role: string;
  created_at: Date;
}

export class UserService {
  static async getAll(): Promise<User[]> {
    const query = 'SELECT id, battletag, bnet_id, discord_id, role, created_at FROM users ORDER BY battletag ASC';
    const result = await pool.query(query);
    return result.rows;
  }

  static async updateRole(id: string, role: string): Promise<User | null> {
    const query = 'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [role, id]);
    return result.rows[0] || null;
  }

  static async updateDiscordId(userId: string, discordId: string | null): Promise<User | null> {
    const query = 'UPDATE users SET discord_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [discordId, userId]);
    return result.rows[0] || null;
  }

  static async hasCharacters(userId: string): Promise<boolean> {
    const query = 'SELECT 1 FROM characters WHERE user_id = $1 LIMIT 1';
    const result = await pool.query(query, [userId]);
    return (result.rowCount ?? 0) > 0;
  }
}
