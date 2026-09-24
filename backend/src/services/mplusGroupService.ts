import { PoolClient } from 'pg';
import { withTransaction } from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { MPLUS_GROUP_SIZE, MPLUS_MAX_GROUPS } from '../schemas/eventSchemas';

export interface GroupAssignment {
  user_id: string;
  group_index: number; // 0 = sans groupe
}

/** État complet des groupes d'une sortie M+, renvoyé après chaque modification. */
export interface MplusGroupsState {
  mm_groups_count: number;
  assignments: GroupAssignment[];
}

interface LockedEvent {
  type: string;
  is_canceled: boolean | null;
  mm_groups_count: number | null;
}

/**
 * Groupes Mythique+ d'un événement. Chaque opération verrouille la ligne de l'événement
 * (FOR UPDATE) : les modifications concurrentes sont sérialisées et la limite de
 * MPLUS_GROUP_SIZE joueurs par groupe ne peut pas être contournée.
 * Note : `event_signups.updated_at` n'est volontairement pas modifié, il sert de date d'inscription côté UI.
 */
export class MplusGroupService {
  static addGroup(guildId: string, eventId: string): Promise<MplusGroupsState> {
    return withTransaction(async (client) => {
      const count = await lockEvent(client, guildId, eventId);
      if (count >= MPLUS_MAX_GROUPS) {
        throw new HttpError(409, `An event cannot have more than ${MPLUS_MAX_GROUPS} groups`, 'GROUP_LIMIT');
      }
      await client.query(
        'UPDATE events SET mm_groups_count = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [eventId, count + 1],
      );
      return readState(client, eventId, count + 1);
    });
  }

  /** Supprime un groupe : ses membres repassent sans groupe et les groupes suivants sont renumérotés. */
  static deleteGroup(guildId: string, eventId: string, index: number): Promise<MplusGroupsState> {
    return withTransaction(async (client) => {
      const count = await lockEvent(client, guildId, eventId);
      assertGroupExists(index, count);

      await client.query(
        `UPDATE event_signups
         SET group_index = CASE WHEN group_index = $2 THEN 0 ELSE group_index - 1 END
         WHERE event_id = $1 AND group_index >= $2`,
        [eventId, index],
      );
      await client.query(
        'UPDATE events SET mm_groups_count = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [eventId, count - 1],
      );
      return readState(client, eventId, count - 1);
    });
  }

  static moveSignup(
    guildId: string,
    eventId: string,
    userId: string,
    groupIndex: number,
  ): Promise<MplusGroupsState> {
    return withTransaction(async (client) => {
      const count = await lockEvent(client, guildId, eventId);
      if (groupIndex > 0) assertGroupExists(groupIndex, count);

      const { rows } = await client.query<{ status: string }>(
        'SELECT status FROM event_signups WHERE event_id = $1 AND user_id = $2',
        [eventId, userId],
      );
      if (!rows[0]) throw new HttpError(404, 'Signup not found', 'SIGNUP_NOT_FOUND');
      if (rows[0].status === 'absent') {
        throw new HttpError(409, 'An absent player cannot join a group', 'SIGNUP_ABSENT');
      }

      if (groupIndex > 0) {
        const { rows: size } = await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM event_signups
           WHERE event_id = $1 AND group_index = $2 AND user_id <> $3 AND status <> 'absent'`,
          [eventId, groupIndex, userId],
        );
        if (size[0].n >= MPLUS_GROUP_SIZE) {
          throw new HttpError(409, 'This group is already full', 'GROUP_FULL');
        }
      }

      await client.query(
        'UPDATE event_signups SET group_index = $3 WHERE event_id = $1 AND user_id = $2',
        [eventId, userId, groupIndex],
      );
      return readState(client, eventId, count);
    });
  }

  /** Applique plusieurs placements d'un coup (remplissage automatique, réinitialisation). Les absents sont ignorés. */
  static setAssignments(
    guildId: string,
    eventId: string,
    assignments: GroupAssignment[],
  ): Promise<MplusGroupsState> {
    return withTransaction(async (client) => {
      const count = await lockEvent(client, guildId, eventId);
      const userIds = assignments.map((a) => a.user_id);
      if (new Set(userIds).size !== userIds.length) {
        throw new HttpError(400, 'A player can only be assigned once', 'DUPLICATE_ASSIGNMENT');
      }
      for (const a of assignments) {
        if (a.group_index > 0) assertGroupExists(a.group_index, count);
      }

      await client.query(
        `UPDATE event_signups s SET group_index = a.group_index
         FROM unnest($2::varchar[], $3::int[]) AS a(user_id, group_index)
         WHERE s.event_id = $1 AND s.user_id = a.user_id AND s.status <> 'absent'`,
        [eventId, userIds, assignments.map((a) => a.group_index)],
      );

      const { rowCount } = await client.query(
        `SELECT 1 FROM event_signups
         WHERE event_id = $1 AND status <> 'absent' AND group_index BETWEEN 1 AND $2
         GROUP BY group_index HAVING COUNT(*) > $3`,
        [eventId, count, MPLUS_GROUP_SIZE],
      );
      if (rowCount) throw new HttpError(409, `A group cannot exceed ${MPLUS_GROUP_SIZE} players`, 'GROUP_FULL');

      return readState(client, eventId, count);
    });
  }
}

/** Verrouille l'événement (scopé par guilde) et renvoie son nombre de groupes. */
async function lockEvent(client: PoolClient, guildId: string, eventId: string): Promise<number> {
  const { rows } = await client.query<LockedEvent>(
    'SELECT type, is_canceled, mm_groups_count FROM events WHERE id = $1 AND guild_id = $2 FOR UPDATE',
    [eventId, guildId],
  );
  const event = rows[0];
  if (!event) throw new HttpError(404, 'Event not found', 'EVENT_NOT_FOUND');
  if (event.type?.toLowerCase() !== 'mm+') {
    throw new HttpError(400, 'Groups are only available for Mythic+ events', 'NOT_MPLUS');
  }
  if (event.is_canceled) throw new HttpError(409, 'This event has been canceled', 'EVENT_CANCELED');
  return event.mm_groups_count ?? 0;
}

function assertGroupExists(index: number, count: number): void {
  if (index < 1 || index > count) throw new HttpError(404, 'Group not found', 'GROUP_NOT_FOUND');
}

/** Un index hors des groupes existants (ex. nombre de groupes réduit via l'édition) vaut « sans groupe ». */
async function readState(client: PoolClient, eventId: string, count: number): Promise<MplusGroupsState> {
  const { rows } = await client.query<GroupAssignment>(
    `SELECT user_id,
            CASE WHEN group_index BETWEEN 1 AND $2 THEN group_index ELSE 0 END AS group_index
     FROM event_signups
     WHERE event_id = $1 AND status <> 'absent'`,
    [eventId, count],
  );
  return { mm_groups_count: count, assignments: rows };
}
