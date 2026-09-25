import pool, { withTransaction } from '../lib/db';
import { BlizzardService, BnetCharacter } from './blizzardService';
import { WowRegion, parseVirtualGuildId, toVirtualGuildId, toWowRegion } from '../lib/regions';
import { HttpError } from '../middlewares/errorHandler';

/** Clé d'un personnage (nom + royaume), insensible à la casse. */
export const characterKey = (c: { name: string; realm: string }) =>
  `${c.name.trim().toLowerCase()}|${c.realm.trim().toLowerCase()}`;

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

  /**
   * Utilisateur avec le rôle et le rang de sa guilde active (req.user, /users/me). Les colonnes
   * users.role / users.rank sont historiques : le rôle dépend de la guilde.
   */
  static async getWithActiveGuildRole(userId: string): Promise<any | null> {
    const { rows } = await pool.query(
      `SELECT u.*, COALESCE(gm.role, 'member') AS role, gm.rank AS rank
       FROM users u
       LEFT JOIN guild_members gm ON gm.user_id = u.id AND gm.guild_id = u.active_guild_id
       WHERE u.id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  static async getAllForGuild(guildId: string): Promise<any[]> {
    const query = `
      SELECT u.id, u.battletag, u.bnet_id, u.discord_id,
             COALESCE(MAX(gm.role), 'member') AS role, u.created_at,
             (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) 
              FROM characters 
              WHERE user_id = u.id AND guild_id = $1) as characters
      FROM users u
      LEFT JOIN characters c ON u.id = c.user_id
      LEFT JOIN guild_members gm ON gm.user_id = u.id AND gm.guild_id = $1
      WHERE c.guild_id = $1 OR u.active_guild_id = $1 OR gm.guild_id = $1
      GROUP BY u.id, u.battletag, u.bnet_id, u.discord_id, u.created_at
      ORDER BY u.battletag ASC
    `;
    const result = await pool.query(query, [guildId]);
    return result.rows;
  }

  /** Membre d'une guilde : un personnage dans la guilde, ou la guilde active de l'utilisateur. */
  static async isGuildMember(userId: string, guildId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM users u
       WHERE u.id = $1
         AND (u.active_guild_id = $2
              OR EXISTS (SELECT 1 FROM guild_members gm WHERE gm.user_id = u.id AND gm.guild_id = $2)
              OR EXISTS (SELECT 1 FROM characters c WHERE c.user_id = u.id AND c.guild_id = $2))`,
      [userId, guildId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Rôle du joueur dans une guilde donnée (sans effet sur ses autres guildes). */
  static async updateRole(id: string, role: string, guildId: string): Promise<any | null> {
    const { rows } = await pool.query(
      `INSERT INTO guild_members (user_id, guild_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, guild_id)
       DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP
       RETURNING user_id AS id, guild_id, role, rank`,
      [id, guildId, role],
    );
    return rows[0] ?? null;
  }

  /**
   * Retire un joueur d'une guilde : ses personnages, inscriptions et absences dans cette guilde et
   * son rôle. Son compte et ses autres guildes sont conservés ; l'historique des cotisations aussi.
   */
  static async removeFromGuild(userId: string, guildId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      await client.query(
        `DELETE FROM event_signups s USING events e
         WHERE s.event_id = e.id AND e.guild_id = $2 AND s.user_id = $1`,
        [userId, guildId],
      );
      await client.query('DELETE FROM absences WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);
      const chars = await client.query('DELETE FROM characters WHERE user_id = $1 AND guild_id = $2', [
        userId,
        guildId,
      ]);
      const member = await client.query(
        'DELETE FROM guild_members WHERE user_id = $1 AND guild_id = $2',
        [userId, guildId],
      );
      await client.query(
        'UPDATE users SET active_guild_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND active_guild_id = $2',
        [userId, guildId],
      );
      return (chars.rowCount ?? 0) + (member.rowCount ?? 0) > 0;
    });
  }

  static async updateDiscordId(userId: string, discordId: string | null): Promise<User | null> {
    const query = 'UPDATE users SET discord_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [discordId, userId]);
    return result.rows[0] || null;
  }

  static async updateBirthday(userId: string, birthday: string | null): Promise<any | null> {
    const query = 'UPDATE users SET birthday = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [birthday, userId]);
    return result.rows[0] || null;
  }

  static async updateProfessions(userId: string, professions: string[]): Promise<any | null> {
    const query = 'UPDATE users SET professions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [professions, userId]);
    return result.rows[0] || null;
  }

  static async hasCharacters(userId: string): Promise<boolean> {
    const query = 'SELECT 1 FROM characters WHERE user_id = $1 LIMIT 1';
    const result = await pool.query(query, [userId]);
    return (result.rowCount ?? 0) > 0;
  }

  static async getUserGuilds(userId: string): Promise<any[]> {
    const query = `
      SELECT DISTINCT g.* 
      FROM guilds g
      JOIN characters c ON c.guild_id = g.id
      WHERE c.user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async updateActiveGuild(userId: string, guildId: string): Promise<boolean> {
    // Security check: verify the user has a character in this guild
    const checkQuery = `
      SELECT 1 FROM characters 
      WHERE user_id = $1 AND guild_id = $2 
      LIMIT 1
    `;
    const checkRes = await pool.query(checkQuery, [userId, guildId]);
    if (checkRes.rowCount === 0) {
      throw new Error('User does not have any characters in this guild.');
    }

    const query = 'UPDATE users SET active_guild_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    const result = await pool.query(query, [guildId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  /** Public fields only: Stripe ids and Discord channel config never reach the browser. */
  static async getActiveGuild(userId: string): Promise<any | null> {
    const query = `
      SELECT g.id, g.name, g.realm, g.region, g.subscription_tier, g.subscription_expires_at
      FROM guilds g
      JOIN users u ON u.active_guild_id = g.id
      WHERE u.id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  /** Guilde enregistrée si elle existe, sinon entrée "virtuelle" à créer à la sélection. */
  private static async toSelectableGuild(guild: {
    blizzard_id: number;
    name: string;
    realm: string;
    region: WowRegion;
    subscription_tier?: string;
    subscription_expires_at?: Date | null;
  }): Promise<any> {
    const dbRes = await pool.query(
      `SELECT id, name, realm, region, subscription_tier, subscription_expires_at
       FROM guilds
       WHERE blizzard_id = $1 AND region = $2`,
      [guild.blizzard_id, guild.region],
    );
    if (dbRes.rows[0]) return dbRes.rows[0];
    return {
      id: toVirtualGuildId(guild.region, guild.blizzard_id),
      blizzard_id: guild.blizzard_id,
      name: guild.name,
      realm: guild.realm,
      region: guild.region,
      subscription_tier: guild.subscription_tier || 'none',
      subscription_expires_at: guild.subscription_expires_at || null,
      is_virtual: true,
    };
  }

  static async discoverUserGuilds(accessToken: string): Promise<any[]> {
    if (accessToken.startsWith('mock_')) {
      const { mockCharacters, mockGuilds } = require('../lib/mockData');
      const userChars = mockCharacters.filter((c: any) => c.user_id === accessToken);
      const guildIds = Array.from(new Set(userChars.map((c: any) => c.guild_id).filter((id: any) => id !== null)));

      const registeredGuilds: any[] = [];
      for (const gid of guildIds) {
        const guild = mockGuilds.find((g: any) => g.id === gid);
        if (guild) {
          registeredGuilds.push(await this.toSelectableGuild({ ...guild, region: toWowRegion(guild.region) }));
        }
      }
      return registeredGuilds;
    }

    // Guilde de chaque personnage, toutes régions confondues (clé région + id Blizzard)
    const characters = await BlizzardService.getAccountCharacters(accessToken);
    const uniqueGuildsMap = new Map<string, { blizzard_id: number; name: string; realm: string; region: WowRegion }>();
    await Promise.all(
      characters.map(async (char) => {
        const summary = await BlizzardService.getCharacterSummary(accessToken, char.region, char.realmSlug || char.realm, char.name);
        if (summary?.guild) {
          uniqueGuildsMap.set(`${char.region}:${summary.guild.id}`, {
            blizzard_id: summary.guild.id,
            name: summary.guild.name,
            realm: summary.guild.realm?.name || char.realm,
            region: char.region,
          });
        }
      })
    );

    // Les guildes ne sont pas créées ici, seulement à la sélection
    const registeredGuilds: any[] = [];
    for (const guild of uniqueGuildsMap.values()) {
      registeredGuilds.push(await this.toSelectableGuild(guild));
    }
    return registeredGuilds;
  }

  /**
   * Personnages du compte qui appartiennent vraiment à la guilde : même région et id de guilde
   * vérifié via l'API Blizzard. C'est la seule preuve d'appartenance acceptée (jamais le client).
   * `only` restreint la vérification aux personnages demandés ; `guildInfo` vient de Blizzard.
   */
  static async findGuildCharacters(
    userId: string,
    accessToken: string,
    guild: { id: string | null; blizzard_id: number; region: string },
    only?: (char: { name: string; realm: string }) => boolean,
  ): Promise<{ characters: BnetCharacter[]; guildInfo: { name: string; realm: string } | null }> {
    const region = toWowRegion(guild.region);

    if (accessToken.startsWith('mock_')) {
      const { mockCharacters } = require('../lib/mockData');
      const characters: BnetCharacter[] = mockCharacters
        .filter((c: any) => c.user_id === userId && c.guild_id === guild.id)
        .map((c: any) => ({ name: c.name, realm: c.realm, realmSlug: null, class: c.class, level: c.level, region }))
        .filter((c: BnetCharacter) => !only || only(c));
      return { characters, guildInfo: null };
    }

    const candidates = (await BlizzardService.getAccountCharacters(accessToken))
      .filter((c) => c.region === region && (!only || only(c)));
    const characters: BnetCharacter[] = [];
    let guildInfo: { name: string; realm: string } | null = null;
    await Promise.all(
      candidates.map(async (char) => {
        const summary = await BlizzardService.getCharacterSummary(accessToken, region, char.realmSlug || char.realm, char.name);
        if (summary?.guild?.id !== guild.blizzard_id) return;
        characters.push(char);
        guildInfo ??= { name: summary.guild.name, realm: summary.guild.realm?.name || char.realm };
      })
    );
    return { characters, guildInfo };
  }

  static async fetchGuildCharacters(userId: string, guildId: string, accessToken: string): Promise<any[]> {
    const virtual = parseVirtualGuildId(guildId);
    const guildRes = virtual
      ? await pool.query('SELECT * FROM guilds WHERE blizzard_id = $1 AND region = $2', [virtual.blizzardId, virtual.region])
      : await pool.query('SELECT * FROM guilds WHERE id = $1', [guildId]);
    let guild = guildRes.rows[0];
    if (!guild && !virtual) throw new HttpError(404, 'Guild not found', 'GUILD_NOT_FOUND');

    // Appartenance prouvée par Blizzard AVANT toute écriture (guilde active, membre, rang)
    const target = guild ?? { id: null, blizzard_id: virtual!.blizzardId, region: virtual!.region };
    const { characters, guildInfo } = await this.findGuildCharacters(userId, accessToken, target);
    if (characters.length === 0) {
      throw new HttpError(403, 'None of your characters belongs to this guild', 'NOT_A_GUILD_MEMBER');
    }
    const matchingCharacters = characters.map((char) => ({ ...char, is_main: false }));

    if (!guild) {
      // Première sélection de cette guilde : nom et royaume viennent de Blizzard
      const insertRes = await pool.query(`
        INSERT INTO guilds (blizzard_id, name, realm, region)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (blizzard_id, region) DO UPDATE
        SET name = EXCLUDED.name, realm = EXCLUDED.realm, updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [virtual!.blizzardId, guildInfo?.name ?? '', guildInfo?.realm ?? '', virtual!.region]);
      guild = insertRes.rows[0];
    }
    const realGuildId: string = guild.id;
    const guildRegion = toWowRegion(guild.region);

    await pool.query('UPDATE users SET active_guild_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [realGuildId, userId]);

    // Check if any of the user's characters in the guild is the Guild Master (rank 0)
    let isGuildMaster = false;
    let userRank = 9; // Default rank (lowest rank)
    try {
      if (accessToken.startsWith('mock_')) {
        const { mockUsers } = require('../lib/mockData');
        const mockUser = mockUsers.find((u: any) => u.id === userId);
        userRank = mockUser?.rank !== null && mockUser?.rank !== undefined ? mockUser.rank : 9;
        isGuildMaster = userRank === 0;
      } else {
        const roster = await BlizzardService.getGuildRoster(accessToken, guildRegion, guild.realm, guild.name);
        if (roster && roster.members) {
          const guildMasterMember = roster.members.find((m: any) => m.rank === 0);
          if (guildMasterMember && guildMasterMember.character) {
            const gmName = guildMasterMember.character.name.toLowerCase();
            isGuildMaster = matchingCharacters.some(
              (char) => char.name.toLowerCase() === gmName
            );
          }

          // Calculate user's minimum rank (highest position) across all their characters in this guild
          const matchingCharNames = matchingCharacters.map((c: any) => c.name.toLowerCase());
          const userRosterMembers = roster.members.filter((m: any) => 
            m.character && matchingCharNames.includes(m.character.name.toLowerCase())
          );
          if (userRosterMembers.length > 0) {
            userRank = Math.min(...userRosterMembers.map((m: any) => m.rank));
          }
        }
      }
    } catch (err) {
      console.error('[UserService] Failed to fetch guild roster for GM/Rank check:', err);
    }

    // Rôle dans CETTE guilde : le GM en jeu est admin, un ancien GM redevient membre
    const memberRes = await pool.query(
      'SELECT role FROM guild_members WHERE user_id = $1 AND guild_id = $2',
      [userId, realGuildId],
    );
    let defaultRole = 'member';
    if (accessToken.startsWith('mock_')) {
      // Profils de test : rôle prédéfini à la première connexion à la guilde
      const { mockUsers } = require('../lib/mockData');
      defaultRole = mockUsers.find((u: any) => u.id === userId)?.role ?? 'member';
    }
    const currentRole = memberRes.rows[0]?.role || defaultRole;
    let newRole = currentRole;

    if (isGuildMaster) {
      newRole = 'admin';
    } else if (currentRole === 'admin') {
      newRole = 'member';
    }

    console.log(`[UserService] Saving user ${userId} rank: ${userRank}, role: ${newRole} during fetchGuildCharacters`);
    await pool.query(
      `INSERT INTO guild_members (user_id, guild_id, role, rank)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, guild_id)
       DO UPDATE SET role = EXCLUDED.role, rank = EXCLUDED.rank, updated_at = CURRENT_TIMESTAMP`,
      [userId, realGuildId, newRole, userRank]
    );

    return matchingCharacters;
  }

  static async importSelectedCharacters(userId: string, guildId: string, accessToken: string, selectedCharacters: any[]): Promise<void> {
    const guildRes = await pool.query('SELECT id, blizzard_id, region FROM guilds WHERE id = $1', [guildId]);
    const guild = guildRes.rows[0];
    if (!guild) throw new HttpError(404, 'Guild not found', 'GUILD_NOT_FOUND');

    if (selectedCharacters.length === 0) {
      throw new HttpError(400, 'Please select at least one character to import', 'NO_CHARACTER_SELECTED');
    }

    // Seuls les personnages vérifiés dans cette guilde sont importés, avec les données Blizzard
    const selected = new Map(selectedCharacters.map((c: any) => [characterKey(c), !!c.is_main]));
    const { characters } = await this.findGuildCharacters(userId, accessToken, guild, (c) => selected.has(characterKey(c)));
    if (characters.length === 0) {
      throw new HttpError(403, 'None of the selected characters belongs to this guild', 'NOT_A_GUILD_MEMBER');
    }
    selectedCharacters = characters.map((c) => ({ ...c, is_main: selected.get(characterKey(c)) }));

    // Insert characters into database
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete any existing characters of this user in this guild before inserting new selection
      await client.query('DELETE FROM characters WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);

      for (const char of selectedCharacters) {
        const query = `
          INSERT INTO characters (user_id, guild_id, name, realm, class, level, is_main)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (name, realm, user_id) 
          DO UPDATE SET 
            level = EXCLUDED.level,
            class = EXCLUDED.class,
            guild_id = EXCLUDED.guild_id,
            is_main = EXCLUDED.is_main,
            updated_at = CURRENT_TIMESTAMP
        `;
        await client.query(query, [userId, guildId, char.name, char.realm, char.class, char.level, char.is_main || false]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async getGuildBirthdaysThisMonth(guildId: string): Promise<any[]> {
    const query = `
      SELECT u.id, u.battletag, u.birthday,
             COALESCE(
               (SELECT name FROM characters WHERE user_id = u.id AND is_main = true AND guild_id = $1 LIMIT 1),
               (SELECT name FROM characters WHERE user_id = u.id AND is_main = true LIMIT 1),
               SPLIT_PART(u.battletag, '#', 1)
             ) as main_character
      FROM users u
      WHERE (u.active_guild_id = $1 OR EXISTS (SELECT 1 FROM characters WHERE user_id = u.id AND guild_id = $1))
        AND u.birthday IS NOT NULL
        AND EXTRACT(MONTH FROM u.birthday) = EXTRACT(MONTH FROM CURRENT_DATE)
      ORDER BY EXTRACT(DAY FROM u.birthday) ASC
    `;
    const result = await pool.query(query, [guildId]);
    return result.rows;
  }

  static async getUserAttendance(userId: string, guildId: string): Promise<{
    percentage: number;
    total_eligible: number;
    attended: number;
    events: any[];
  }> {
    const query = `
      SELECT 
        e.id, 
        e.title, 
        to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
        e.type, 
        e.roster_id, 
        r.name AS roster_name,
        s.status,
        s.character_id,
        c.name AS character_name
      FROM events e
      LEFT JOIN rosters r ON e.roster_id = r.id
      LEFT JOIN event_signups s ON e.id = s.event_id AND s.user_id = $2
      LEFT JOIN characters c ON s.character_id = c.id
      WHERE e.guild_id = $1
        AND e.is_canceled = FALSE
        AND e.start_time < CURRENT_TIMESTAMP
        AND DATE_TRUNC('month', e.start_time) = DATE_TRUNC('month', CURRENT_TIMESTAMP)
        AND (
          e.roster_id IS NULL
          OR EXISTS (
            SELECT 1 
            FROM characters c2
            JOIN rosters rc ON c2.roster_id = rc.id
            WHERE c2.user_id = $2
              AND c2.guild_id = $1
              AND rc.weight <= r.weight
          )
        )
        AND NOT EXISTS (
          SELECT 1 
          FROM absences a 
          WHERE a.user_id = $2 
            AND a.guild_id = $1 
            AND e.start_time::date >= a.start_date 
            AND e.start_time::date <= a.end_date
        )
        AND (
          e.type != 'reunion'
          OR e.invited_groups IS NULL
          OR array_length(e.invited_groups, 1) IS NULL
          OR 'all' = ANY(e.invited_groups)
          OR EXISTS (
            SELECT 1 
            FROM guild_members gm2
            WHERE gm2.user_id = $2 AND gm2.guild_id = $1
              AND (gm2.role = 'admin' OR gm2.role = ANY(e.invited_groups))
          )
        )
      ORDER BY e.start_time DESC
    `;
    const result = await pool.query(query, [guildId, userId]);
    const rows = result.rows;
    
    const totalEligible = rows.length;
    const attended = rows.filter(r => r.status === 'signed_up' || r.status === 'standby').length;
    const percentage = totalEligible > 0 ? Math.round((attended / totalEligible) * 100) : 100;

    return {
      percentage,
      total_eligible: totalEligible,
      attended,
      events: rows
    };
  }

  static async getGuildAttendance(guildId: string): Promise<any[]> {
    const query = `
      WITH guild_users AS (
        SELECT DISTINCT u.id, u.battletag, COALESCE(gm.role, 'member') AS role
        FROM users u
        LEFT JOIN characters c ON u.id = c.user_id
        LEFT JOIN guild_members gm ON gm.user_id = u.id AND gm.guild_id = $1
        WHERE c.guild_id = $1 OR u.active_guild_id = $1
      ),
      past_events AS (
        SELECT e.id, e.title, e.roster_id, r.weight as roster_weight, e.start_time, e.type, e.invited_groups
        FROM events e
        LEFT JOIN rosters r ON e.roster_id = r.id
        WHERE e.guild_id = $1
          AND e.is_canceled = FALSE
          AND e.start_time < CURRENT_TIMESTAMP
          AND DATE_TRUNC('month', e.start_time) = DATE_TRUNC('month', CURRENT_TIMESTAMP)
      ),
      user_eligibility AS (
        SELECT 
          gu.id as user_id,
          pe.id as event_id
        FROM guild_users gu
        CROSS JOIN past_events pe
        WHERE (pe.roster_id IS NULL
           OR EXISTS (
             SELECT 1 
             FROM characters c2
             JOIN rosters rc ON c2.roster_id = rc.id
             WHERE c2.user_id = gu.id
               AND c2.guild_id = $1
               AND rc.weight <= pe.roster_weight
           ))
           AND NOT EXISTS (
             SELECT 1
             FROM absences a
             WHERE a.user_id = gu.id
               AND a.guild_id = $1
               AND pe.start_time::date >= a.start_date
               AND pe.start_time::date <= a.end_date
           )
           AND (
             pe.type != 'reunion'
             OR pe.invited_groups IS NULL
             OR array_length(pe.invited_groups, 1) IS NULL
             OR 'all' = ANY(pe.invited_groups)
             OR gu.role = 'admin'
             OR gu.role = ANY(pe.invited_groups)
           )
      ),
      user_attendance AS (
        SELECT 
          ue.user_id,
          COUNT(ue.event_id) as total_eligible,
          COUNT(CASE WHEN s.status IN ('signed_up', 'standby') THEN 1 END) as attended
        FROM user_eligibility ue
        LEFT JOIN event_signups s ON ue.event_id = s.event_id AND ue.user_id = s.user_id
        GROUP BY ue.user_id
      )
      SELECT 
        gu.id,
        gu.battletag,
        COALESCE(
          (SELECT name FROM characters WHERE user_id = gu.id AND is_main = true AND guild_id = $1 LIMIT 1),
          (SELECT name FROM characters WHERE user_id = gu.id AND is_main = true LIMIT 1),
          SPLIT_PART(gu.battletag, '#', 1)
        ) as main_character_name,
        COALESCE(
          (SELECT class FROM characters WHERE user_id = gu.id AND is_main = true AND guild_id = $1 LIMIT 1),
          (SELECT class FROM characters WHERE user_id = gu.id AND is_main = true LIMIT 1),
          'Unknown'
        ) as main_character_class,
        COALESCE(ua.total_eligible, 0) as total_eligible,
        COALESCE(ua.attended, 0) as attended,
        CASE 
          WHEN COALESCE(ua.total_eligible, 0) > 0 
          THEN ROUND((COALESCE(ua.attended, 0)::float / ua.total_eligible) * 100)
          ELSE 100 
        END as percentage
      FROM guild_users gu
      LEFT JOIN user_attendance ua ON gu.id = ua.user_id
      ORDER BY percentage DESC, gu.battletag ASC
    `;
    const result = await pool.query(query, [guildId]);
    return result.rows;
  }

  static async declareAbsence(
    userId: string,
    guildId: string,
    startDate: string,
    endDate: string | null | undefined,
    reason?: string | null
  ): Promise<any> {
    const query = `
      INSERT INTO absences (user_id, guild_id, start_date, end_date, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, guild_id, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, reason, created_at
    `;
    const result = await pool.query(query, [userId, guildId, startDate, endDate || null, reason || null]);
    return result.rows[0];
  }

  static async getUserAbsences(userId: string, guildId: string): Promise<any[]> {
    const query = `
      SELECT 
        id, 
        user_id, 
        guild_id, 
        to_char(start_date, 'YYYY-MM-DD') as start_date, 
        to_char(end_date, 'YYYY-MM-DD') as end_date, 
        reason, 
        created_at
      FROM absences
      WHERE user_id = $1 AND guild_id = $2
      ORDER BY start_date DESC
    `;
    const result = await pool.query(query, [userId, guildId]);
    return result.rows;
  }

  static async deleteUserAbsence(absenceId: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM absences
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await pool.query(query, [absenceId, userId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  static async getGuildAbsences(guildId: string): Promise<any[]> {
    const query = `
      SELECT 
        a.id, 
        a.user_id, 
        a.guild_id, 
        to_char(a.start_date, 'YYYY-MM-DD') as start_date, 
        to_char(a.end_date, 'YYYY-MM-DD') as end_date, 
        a.reason, 
        a.created_at,
        u.battletag,
        COALESCE(
          (SELECT name FROM characters WHERE user_id = u.id AND is_main = true AND guild_id = $1 LIMIT 1),
          (SELECT name FROM characters WHERE user_id = u.id AND is_main = true LIMIT 1),
          SPLIT_PART(u.battletag, '#', 1)
        ) as main_character_name,
        COALESCE(
          (SELECT class FROM characters WHERE user_id = u.id AND is_main = true AND guild_id = $1 LIMIT 1),
          (SELECT class FROM characters WHERE user_id = u.id AND is_main = true LIMIT 1),
          'Unknown'
        ) as main_character_class
      FROM absences a
      JOIN users u ON a.user_id = u.id
      WHERE a.guild_id = $1
      ORDER BY a.start_date DESC
    `;
    const result = await pool.query(query, [guildId]);
    return result.rows;
  }

  static async deleteGuildAbsenceAdmin(absenceId: string, guildId: string): Promise<boolean> {
    const query = `
      DELETE FROM absences
      WHERE id = $1 AND guild_id = $2
      RETURNING id
    `;
    const result = await pool.query(query, [absenceId, guildId]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}
