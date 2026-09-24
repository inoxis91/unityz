import pool, { withTransaction } from '../lib/db';
import { assertRosterQuota } from './tierLimits';
import { Character } from './characterService';

export type RosterRole = 'tank' | 'heal' | 'dps';

// Rôle par défaut déduit des rôles déclarés par le joueur (priorité tank > heal > dps)
const DEFAULT_ROLE_SQL = `CASE WHEN is_tank THEN 'tank' WHEN is_heal THEN 'heal' ELSE 'dps' END`;

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
    const rosters: Roster[] = (await pool.query(rostersQuery, params)).rows;
    if (rosters.length === 0) return rosters;

    const charsResult = await pool.query(
      `SELECT *, COALESCE(roster_role, ${DEFAULT_ROLE_SQL}) AS roster_role
       FROM characters WHERE roster_id = ANY($1::uuid[]) ORDER BY name ASC`,
      [rosters.map((r) => r.id)],
    );
    const byRoster = new Map<string, Character[]>(rosters.map((r) => [r.id, []]));
    for (const char of charsResult.rows) byRoster.get(char.roster_id)?.push(char);
    for (const roster of rosters) roster.characters = byRoster.get(roster.id);

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
    // Quota de l'offre vérifié et insertion dans la même transaction (ligne guilde verrouillée)
    return withTransaction(async (client) => {
      await assertRosterQuota(client, guildId);
      const result = await client.query(query, [data.name, data.description, data.weight || 1, guildId]);
      return result.rows[0];
    });
  }

  static async update(id: string, data: Partial<Roster>, guildId: string): Promise<Roster | null> {
    const query = `
      UPDATE rosters 
      SET name = $1, description = $2, weight = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND guild_id = $5
      RETURNING *
    `;
    const result = await pool.query(query, [data.name, data.description, data.weight, id, guildId]);
    return result.rows[0] || null;
  }

  static async delete(id: string, guildId: string): Promise<boolean> {
    const query = 'DELETE FROM rosters WHERE id = $1 AND guild_id = $2';
    const result = await pool.query(query, [id, guildId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Assigne un personnage à un roster (ou le désassigne si rosterId est null).
   * Sans rôle explicite, conserve le rôle actuel ou le déduit des rôles déclarés.
   * Le personnage et le roster doivent appartenir à la guilde active.
   */
  static async assignCharacter(
    characterId: string,
    rosterId: string | null,
    guildId: string,
    role?: RosterRole,
  ): Promise<boolean> {
    const query = `
      UPDATE characters 
      SET roster_id = $1,
          roster_role = CASE WHEN $1::uuid IS NULL THEN NULL
                             ELSE COALESCE($2, roster_role, ${DEFAULT_ROLE_SQL}) END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND guild_id = $4
        AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM rosters WHERE id = $1 AND guild_id = $4))
    `;
    const result = await pool.query(query, [rosterId, role ?? null, characterId, guildId]);
    return (result.rowCount ?? 0) > 0;
  }
}
