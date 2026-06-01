import pool from '../lib/db';
import { Character } from './characterService';

export interface Roster {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  created_at: Date;
  updated_at: Date;
  characters?: Character[];
}

export class RosterService {
  static async getAll(guildId?: string): Promise<Roster[]> {
    let rostersQuery = 'SELECT * FROM rosters';
    const params: any[] = [];
    if (guildId) {
      rostersQuery += ' WHERE guild_id = $1';
      params.push(guildId);
    }
    rostersQuery += ' ORDER BY weight ASC, name ASC';
    const rostersResult = await pool.query(rostersQuery, params);
    const rosters = rostersResult.rows;

    for (const roster of rosters) {
      const charsQuery = 'SELECT * FROM characters WHERE roster_id = $1 ORDER BY name ASC';
      const charsResult = await pool.query(charsQuery, [roster.id]);
      roster.characters = charsResult.rows;
    }

    return rosters;
  }

  static async getUnassignedCharacters(guildId?: string): Promise<Character[]> {
    let query = 'SELECT * FROM characters WHERE roster_id IS NULL';
    const params: any[] = [];
    if (guildId) {
      query += ' AND guild_id = $1';
      params.push(guildId);
    }
    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async create(data: Partial<Roster>, guildId: string): Promise<Roster> {
    const query = `
      INSERT INTO rosters (name, description, weight, guild_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await pool.query(query, [data.name, data.description, data.weight || 1, guildId]);
    return result.rows[0];
  }

  static async update(id: string, data: Partial<Roster>): Promise<Roster | null> {
    const query = `
      UPDATE rosters 
      SET name = $1, description = $2, weight = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    const result = await pool.query(query, [data.name, data.description, data.weight, id]);
    return result.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM rosters WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  static async assignCharacter(characterId: string, rosterId: string | null): Promise<boolean> {
    const query = `
      UPDATE characters 
      SET roster_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    const result = await pool.query(query, [rosterId, characterId]);
    return (result.rowCount ?? 0) > 0;
  }
}
