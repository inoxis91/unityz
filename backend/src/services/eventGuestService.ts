import type { PoolClient } from 'pg';
import pool, { withTransaction } from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { canPlayRole, WowClassName } from '../lib/wowClasses';
import { assertLineupEditable, LineupSelection, RaidRole } from './lineupRules';

export type GuestKind = 'pug' | 'trial';

/** Joueur externe à la guilde (PU, joueur en test) ajouté au line-up d'un raid. */
export interface EventGuest {
  id: string;
  event_id: string;
  name: string;
  class: WowClassName;
  role: RaidRole;
  kind: GuestKind;
  note: string | null;
  selection: LineupSelection | null;
  created_at: string;
}

export interface GuestInput {
  name: string;
  class: WowClassName;
  role: RaidRole;
  kind: GuestKind;
  note?: string | null;
  selection?: LineupSelection | null;
}

export type GuestPatch = Partial<GuestInput>;

/** Un raid mythique compte 20 joueurs : 30 invités couvrent tous les cas sans permettre d'abus. */
export const MAX_GUESTS_PER_EVENT = 30;

const GUEST_COLUMNS = 'id, event_id, name, class, role, kind, note, selection, created_at';

/** Colonnes modifiables, dans un ordre fixe : seules elles peuvent apparaître dans le SET. */
const PATCHABLE_COLUMNS = ['name', 'class', 'role', 'kind', 'note', 'selection'] as const;

const UNIQUE_VIOLATION = '23505';

export class EventGuestService {
  /** La note est réservée au raid lead : les autres membres reçoivent `note: null`. */
  static async list(guildId: string, eventId: string, withNotes: boolean): Promise<EventGuest[]> {
    const { rows } = await pool.query<EventGuest>(
      `SELECT ${GUEST_COLUMNS} FROM event_guests
       WHERE event_id = $1 AND guild_id = $2
       ORDER BY created_at ASC`,
      [eventId, guildId],
    );
    return withNotes ? rows : rows.map((g) => ({ ...g, note: null }));
  }

  static async create(
    guildId: string,
    eventId: string,
    createdBy: string,
    input: GuestInput,
  ): Promise<EventGuest> {
    assertRolePlayable(input.class, input.role);
    return withTransaction(async (client) => {
      await lockEditableRaid(client, guildId, eventId);
      const { rows } = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM event_guests WHERE event_id = $1',
        [eventId],
      );
      if (rows[0].count >= MAX_GUESTS_PER_EVENT) {
        throw new HttpError(409, 'Too many guests for this event', 'GUEST_LIMIT_REACHED');
      }
      const result = await withNameConflict(() =>
        client.query<EventGuest>(
          `INSERT INTO event_guests (event_id, guild_id, name, class, role, kind, note, selection, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING ${GUEST_COLUMNS}`,
          [
            eventId,
            guildId,
            input.name,
            input.class,
            input.role,
            input.kind,
            input.note ?? null,
            input.selection ?? null,
            createdBy,
          ],
        ),
      );
      return result.rows[0];
    });
  }

  static async update(
    guildId: string,
    eventId: string,
    guestId: string,
    patch: GuestPatch,
  ): Promise<EventGuest> {
    return withTransaction(async (client) => {
      await lockEditableRaid(client, guildId, eventId);
      const { rows } = await client.query<Pick<EventGuest, 'class' | 'role'>>(
        `SELECT class, role FROM event_guests
         WHERE id = $1 AND event_id = $2 AND guild_id = $3
         FOR UPDATE`,
        [guestId, eventId, guildId],
      );
      const current = rows[0];
      if (!current) throw guestNotFound();
      assertRolePlayable(patch.class ?? current.class, patch.role ?? current.role);

      const values: unknown[] = [guestId];
      const sets = PATCHABLE_COLUMNS.filter((column) => patch[column] !== undefined).map(
        (column) => {
          values.push(patch[column]);
          return `${column} = $${values.length}`;
        },
      );
      const result = await withNameConflict(() =>
        client.query<EventGuest>(
          `UPDATE event_guests SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING ${GUEST_COLUMNS}`,
          values,
        ),
      );
      return result.rows[0];
    });
  }

  /** Sélection groupée, dans la transaction du line-up (événement déjà verrouillé et vérifié). */
  static async setSelection(
    client: PoolClient,
    guildId: string,
    eventId: string,
    guestIds: string[],
    selection: LineupSelection | null,
  ): Promise<EventGuest[]> {
    if (guestIds.length === 0) return [];
    const { rows } = await client.query<EventGuest>(
      `UPDATE event_guests SET selection = $4, updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1 AND guild_id = $2 AND id = ANY($3::uuid[])
       RETURNING ${GUEST_COLUMNS}`,
      [eventId, guildId, guestIds, selection],
    );
    return rows;
  }

  static async remove(guildId: string, eventId: string, guestId: string): Promise<void> {
    await withTransaction(async (client) => {
      await lockEditableRaid(client, guildId, eventId);
      const { rowCount } = await client.query(
        'DELETE FROM event_guests WHERE id = $1 AND event_id = $2 AND guild_id = $3',
        [guestId, eventId, guildId],
      );
      if (!rowCount) throw guestNotFound();
    });
  }
}

/**
 * Verrouille l'événement : sérialise les ajouts (quota) et empêche une annulation concurrente
 * de laisser passer une modification.
 */
async function lockEditableRaid(client: PoolClient, guildId: string, eventId: string): Promise<void> {
  const { rows } = await client.query<{ type: string; is_canceled: boolean | null }>(
    'SELECT type, is_canceled FROM events WHERE id = $1 AND guild_id = $2 FOR UPDATE',
    [eventId, guildId],
  );
  if (!rows[0]) throw new HttpError(404, 'Event not found', 'EVENT_NOT_FOUND');
  assertLineupEditable(rows[0]);
}

function assertRolePlayable(className: WowClassName, role: RaidRole): void {
  if (!canPlayRole(className, role)) {
    throw new HttpError(422, 'This class cannot play the requested role', 'ROLE_NOT_PLAYABLE');
  }
}

async function withNameConflict<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new HttpError(409, 'A guest with this name is already in the line-up', 'GUEST_NAME_TAKEN');
    }
    throw error;
  }
}

function guestNotFound(): HttpError {
  return new HttpError(404, 'Guest not found', 'GUEST_NOT_FOUND');
}
