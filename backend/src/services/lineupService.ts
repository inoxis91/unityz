import { PoolClient } from 'pg';
import pool from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { LineupNotifier, LineupSnapshot } from './lineupNotifier';

export type RaidRole = 'tank' | 'heal' | 'dps';
export type LineupSelection = 'selected' | 'benched';

/** État de line-up d'une inscription, renvoyé au frontend après modification. */
export interface LineupEntry {
  user_id: string;
  role: RaidRole;
  selection: LineupSelection | null;
  assigned_role: RaidRole | null;
}

export interface LineupPatch {
  selection?: LineupSelection | null;
  assigned_role?: RaidRole | null;
}

interface LockedSignup extends LineupEntry {
  status: string;
  type: string;
  is_canceled: boolean | null;
  is_tank: boolean | null;
  is_heal: boolean | null;
  is_dps: boolean | null;
}

const LINEUP_COLUMNS = 'user_id, role, selection, assigned_role';

export class LineupService {
  /**
   * Met à jour la sélection (validé / banc / en attente) et/ou le rôle imposé d'un joueur.
   * Note : `updated_at` n'est volontairement pas modifié, il sert de date d'inscription côté UI.
   */
  static async updateEntry(
    guildId: string,
    eventId: string,
    userId: string,
    patch: LineupPatch,
  ): Promise<LineupEntry> {
    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query<LockedSignup>(
        `SELECT s.user_id, s.role, s.selection, s.assigned_role, s.status,
                e.type, e.is_canceled, c.is_tank, c.is_heal, c.is_dps
         FROM event_signups s
         JOIN events e ON e.id = s.event_id
         LEFT JOIN characters c ON c.id = s.character_id
         WHERE s.event_id = $1 AND s.user_id = $2 AND e.guild_id = $3
         FOR UPDATE OF s`,
        [eventId, userId, guildId],
      );
      const current = rows[0];
      if (!current) throw new HttpError(404, 'Signup not found', 'SIGNUP_NOT_FOUND');
      assertLineupEditable(current);
      if (current.status === 'absent') {
        throw new HttpError(409, 'An absent player cannot be part of the line-up', 'SIGNUP_ABSENT');
      }
      if (patch.assigned_role && !playableRoles(current).has(patch.assigned_role)) {
        throw new HttpError(422, 'This character cannot play the requested role', 'ROLE_NOT_PLAYABLE');
      }

      const sets: string[] = [];
      const values: unknown[] = [eventId, userId];
      if (patch.selection !== undefined) {
        values.push(patch.selection);
        sets.push(`selection = $${values.length}`);
      }
      if (patch.assigned_role !== undefined) {
        values.push(patch.assigned_role);
        sets.push(`assigned_role = $${values.length}`);
      }

      const result = await client.query<LineupEntry>(
        `UPDATE event_signups SET ${sets.join(', ')}
         WHERE event_id = $1 AND user_id = $2
         RETURNING ${LINEUP_COLUMNS}`,
        values,
      );
      return { previous: toSnapshot(current), entry: result.rows[0] };
    });

    LineupNotifier.schedule(eventId, userId, updated.previous);
    return updated.entry;
  }

  /** Applique la même sélection à plusieurs joueurs (ex. « valider tous les en attente »). Les absents sont ignorés. */
  static async bulkUpdateSelection(
    guildId: string,
    eventId: string,
    userIds: string[],
    selection: LineupSelection | null,
  ): Promise<LineupEntry[]> {
    const { previous, entries } = await withTransaction(async (client) => {
      const eventRes = await client.query<Pick<LockedSignup, 'type' | 'is_canceled'>>(
        'SELECT type, is_canceled FROM events WHERE id = $1 AND guild_id = $2',
        [eventId, guildId],
      );
      const event = eventRes.rows[0];
      if (!event) throw new HttpError(404, 'Event not found', 'EVENT_NOT_FOUND');
      assertLineupEditable(event);

      const before = await client.query<LineupEntry>(
        `SELECT ${LINEUP_COLUMNS} FROM event_signups
         WHERE event_id = $1 AND user_id = ANY($2::varchar[]) AND status <> 'absent'
         FOR UPDATE`,
        [eventId, userIds],
      );
      const after = await client.query<LineupEntry>(
        `UPDATE event_signups SET selection = $3
         WHERE event_id = $1 AND user_id = ANY($2::varchar[]) AND status <> 'absent'
         RETURNING ${LINEUP_COLUMNS}`,
        [eventId, userIds, selection],
      );
      return { previous: before.rows, entries: after.rows };
    });

    for (const row of previous) {
      LineupNotifier.schedule(eventId, row.user_id, toSnapshot(row));
    }
    return entries;
  }
}

function assertLineupEditable(event: { type: string; is_canceled: boolean | null }): void {
  if (event.type?.toLowerCase() !== 'raid') {
    throw new HttpError(400, 'Line-up management is only available for raid events', 'NOT_A_RAID');
  }
  if (event.is_canceled) {
    throw new HttpError(409, 'This event has been canceled', 'EVENT_CANCELED');
  }
}

/** Rôles jouables : ceux du personnage inscrit, plus le rôle déclaré par le joueur lui-même. */
function playableRoles(signup: LockedSignup): Set<RaidRole> {
  const roles = new Set<RaidRole>([signup.role]);
  if (signup.is_tank) roles.add('tank');
  if (signup.is_heal) roles.add('heal');
  if (signup.is_dps) roles.add('dps');
  return roles;
}

function toSnapshot(entry: Pick<LineupEntry, 'role' | 'selection' | 'assigned_role'>): LineupSnapshot {
  return { selection: entry.selection, role: entry.assigned_role ?? entry.role };
}

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
