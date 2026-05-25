import pool from '../lib/db';

export interface Character {
  id: string;
  user_id: string;
  name: string;
  realm: string;
  class: string;
  level: number;
  is_tank: boolean;
  is_heal: boolean;
  is_dps: boolean;
  is_main: boolean;
  created_at: Date;
  updated_at: Date;
}

export class CharacterService {
  static async getByUserId(userId: string): Promise<Character[]> {
    const query = 'SELECT * FROM characters WHERE user_id = $1 ORDER BY is_main DESC, name ASC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async setMain(charId: string, userId: string): Promise<Character> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Unset existing main
      await client.query('UPDATE characters SET is_main = FALSE WHERE user_id = $1', [userId]);
      
      // 2. Set new main
      const query = `
        UPDATE characters 
        SET is_main = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;
      const result = await client.query(query, [charId, userId]);
      
      if (result.rowCount === 0) {
        throw new Error('Character not found or not owned by user');
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async importCharacters(userId: string, characters: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const char of characters) {
        const query = `
          INSERT INTO characters (user_id, name, realm, class, level)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (name, realm, user_id) 
          DO UPDATE SET 
            level = EXCLUDED.level,
            class = EXCLUDED.class,
            updated_at = CURRENT_TIMESTAMP
        `;
        await client.query(query, [userId, char.name, char.realm, char.class, char.level]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async updateRoles(charId: string, userId: string, roles: { isTank: boolean, isHeal: boolean, isDPS: boolean }): Promise<Character> {
    const query = `
      UPDATE characters 
      SET is_tank = $1, is_heal = $2, is_dps = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `;
    const result = await pool.query(query, [roles.isTank, roles.isHeal, roles.isDPS, charId, userId]);
    
    if (result.rowCount === 0) {
      throw new Error('Character not found or not owned by user');
    }
    return result.rows[0];
  }

  static async remove(charId: string, userId: string): Promise<void> {
    const query = 'DELETE FROM characters WHERE id = $1 AND user_id = $2';
    const result = await pool.query(query, [charId, userId]);
    if (result.rowCount === 0) {
      throw new Error('Character not found or not owned by user');
    }
  }
}
