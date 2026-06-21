import pool from '../lib/db';
import axios from 'axios';
import { BlizzardService } from './blizzardService';

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

  static async getAllForGuild(guildId: string): Promise<any[]> {
    const query = `
      SELECT u.id, u.battletag, u.bnet_id, u.discord_id, u.role, u.created_at,
             (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) 
              FROM characters 
              WHERE user_id = u.id AND guild_id = $1) as characters
      FROM users u
      LEFT JOIN characters c ON u.id = c.user_id
      WHERE c.guild_id = $1 OR u.active_guild_id = $1
      GROUP BY u.id, u.battletag, u.bnet_id, u.discord_id, u.role, u.created_at
      ORDER BY u.battletag ASC
    `;
    const result = await pool.query(query, [guildId]);
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

  static async deleteUser(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
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

  static async getActiveGuild(userId: string): Promise<any | null> {
    const query = `
      SELECT g.* 
      FROM guilds g
      JOIN users u ON u.active_guild_id = g.id
      WHERE u.id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
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
          const dbRes = await pool.query(`
            SELECT id, name, realm, region, subscription_tier, subscription_expires_at 
            FROM guilds 
            WHERE blizzard_id = $1
          `, [guild.blizzard_id]);
          
          if (dbRes.rows[0]) {
            registeredGuilds.push(dbRes.rows[0]);
          } else {
            const virtualId = `00000000-0000-0000-0000-${String(guild.blizzard_id).padStart(12, '0')}`;
            registeredGuilds.push({
              id: virtualId,
              blizzard_id: guild.blizzard_id,
              name: guild.name,
              realm: guild.realm,
              region: guild.region,
              subscription_tier: guild.subscription_tier || 'none',
              subscription_expires_at: guild.subscription_expires_at || null,
              is_virtual: true
            });
          }
        }
      }
      return registeredGuilds;
    }

    const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { namespace: 'profile-eu', locale: 'fr_FR' }
    });

    const accounts = response.data.wow_accounts || [];
    const characterSummaries: any[] = [];

    accounts.forEach((account: any) => {
      if (account.characters) {
        account.characters.forEach((char: any) => {
          if (char.name && (char.level || 0) >= 10) {
            characterSummaries.push({
              name: char.name,
              realm: char.realm?.name || 'Inconnu'
            });
          }
        });
      }
    });

    // Fetch character profiles in parallel to find their guild
    const uniqueGuildsMap = new Map<number, any>();

    await Promise.all(
      characterSummaries.map(async (char) => {
        try {
          const summary = await BlizzardService.getCharacterSummary(accessToken, char.realm, char.name);
          if (summary && summary.guild) {
            uniqueGuildsMap.set(summary.guild.id, {
              blizzard_id: summary.guild.id,
              name: summary.guild.name,
              realm: summary.guild.realm?.name || char.realm,
              region: 'eu'
            });
          }
        } catch (err) {
          // Ignore
        }
      })
    );

    const discoveredGuilds = Array.from(uniqueGuildsMap.values());
    const registeredGuilds: any[] = [];

    // Check if guilds exist in database, do not automatically insert them
    for (const guild of discoveredGuilds) {
      const dbRes = await pool.query(`
        SELECT id, name, realm, region, subscription_tier, subscription_expires_at 
        FROM guilds 
        WHERE blizzard_id = $1
      `, [guild.blizzard_id]);
      
      if (dbRes.rows[0]) {
        registeredGuilds.push(dbRes.rows[0]);
      } else {
        const virtualId = `00000000-0000-0000-0000-${String(guild.blizzard_id).padStart(12, '0')}`;
        registeredGuilds.push({
          id: virtualId,
          blizzard_id: guild.blizzard_id,
          name: guild.name,
          realm: guild.realm,
          region: guild.region,
          subscription_tier: 'none',
          subscription_expires_at: null,
          is_virtual: true
        });
      }
    }

    return registeredGuilds;
  }

  static async fetchGuildCharacters(userId: string, guildId: string, accessToken: string): Promise<any[]> {
    let guild = null;
    let realGuildId = guildId;

    if (guildId.startsWith('00000000-0000-0000-0000-')) {
      const blizzardId = parseInt(guildId.split('-').pop() || '0', 10);
      
      const existingRes = await pool.query('SELECT * FROM guilds WHERE blizzard_id = $1', [blizzardId]);
      if (existingRes.rows[0]) {
        guild = existingRes.rows[0];
        realGuildId = guild.id;
      } else {
        let name = '';
        let realm = '';
        let region = 'eu';
        let subTier = 'none';
        let subExpires = null;

        if (accessToken.startsWith('mock_')) {
          const { mockGuilds } = require('../lib/mockData');
          const mockG = mockGuilds.find((g: any) => g.blizzard_id === blizzardId);
          if (mockG) {
            name = mockG.name;
            realm = mockG.realm;
            region = mockG.region || 'eu';
            subTier = mockG.subscription_tier || 'none';
            subExpires = mockG.subscription_expires_at || null;
          }
        } else {
          const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { namespace: 'profile-eu', locale: 'fr_FR' }
          });

          const accounts = response.data.wow_accounts || [];
          const characterSummaries: any[] = [];
          accounts.forEach((account: any) => {
            if (account.characters) {
              account.characters.forEach((char: any) => {
                if (char.name && (char.level || 0) >= 10) {
                  characterSummaries.push({ name: char.name, realm: char.realm?.name || 'Inconnu' });
                }
              });
            }
          });

          for (const char of characterSummaries) {
            try {
              const summary = await BlizzardService.getCharacterSummary(accessToken, char.realm, char.name);
              if (summary && summary.guild && summary.guild.id === blizzardId) {
                name = summary.guild.name;
                realm = summary.guild.realm?.name || char.realm;
                break;
              }
            } catch (err) {
              // Ignore
            }
          }
        }

        const insertRes = await pool.query(`
          INSERT INTO guilds (blizzard_id, name, realm, region, subscription_tier, subscription_expires_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (blizzard_id) DO UPDATE
          SET name = EXCLUDED.name, realm = EXCLUDED.realm, updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `, [blizzardId, name, realm, region, subTier, subExpires]);
        guild = insertRes.rows[0];
        realGuildId = guild.id;
      }
    } else {
      const guildRes = await pool.query('SELECT * FROM guilds WHERE id = $1', [guildId]);
      guild = guildRes.rows[0];
    }

    if (!guild) throw new Error('Guild not found');

    // 2. Set user active guild ID
    await pool.query('UPDATE users SET active_guild_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [realGuildId, userId]);

    // 3. Fetch characters from BNet Account Profile
    let matchingCharacters: any[] = [];
    if (accessToken.startsWith('mock_')) {
      const { mockCharacters } = require('../lib/mockData');
      matchingCharacters = mockCharacters.filter((c: any) => c.user_id === userId && c.guild_id === realGuildId).map((c: any) => ({
        name: c.name,
        realm: c.realm,
        class: c.class,
        level: c.level
      }));
    } else {
      const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { namespace: 'profile-eu', locale: 'fr_FR' }
      });

      const accounts = response.data.wow_accounts || [];

      // 4. Fetch details to find characters belonging to this guild
      const charactersToCheck: any[] = [];
      accounts.forEach((account: any) => {
        if (account.characters) {
          account.characters.forEach((char: any) => {
            if (char.name && (char.level || 0) >= 10) {
              charactersToCheck.push({
                name: char.name,
                realm: char.realm?.name || 'Inconnu',
                class: (char.character_class?.name || char.playable_class?.name || 'Inconnu'),
                level: char.level || 0
              });
            }
          });
        }
      });

      await Promise.all(
        charactersToCheck.map(async (char) => {
          try {
            const summary = await BlizzardService.getCharacterSummary(accessToken, char.realm, char.name);
            if (summary && summary.guild && summary.guild.id === guild.blizzard_id) {
              matchingCharacters.push({
                ...char,
                is_main: false
              });
            }
          } catch (err) {
            // Ignore
          }
        })
      );
    }

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
        const roster = await BlizzardService.getGuildRoster(accessToken, guild.realm, guild.name);
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

    // Update user role based on GM status
    const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const currentRole = userRes.rows[0]?.role || 'member';
    let newRole = currentRole;

    if (isGuildMaster) {
      newRole = 'admin';
    } else if (currentRole === 'admin') {
      newRole = 'member';
    }

    console.log(`[UserService] Saving user ${userId} rank: ${userRank}, role: ${newRole} during fetchGuildCharacters`);
    await pool.query(
      'UPDATE users SET rank = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [userRank, newRole, userId]
    );

    return matchingCharacters;
  }

  static async importSelectedCharacters(userId: string, guildId: string, accessToken: string, selectedCharacters: any[]): Promise<void> {
    const guildRes = await pool.query('SELECT blizzard_id, name, realm FROM guilds WHERE id = $1', [guildId]);
    const guild = guildRes.rows[0];
    if (!guild) throw new Error('Guild not found');

    if (selectedCharacters.length === 0) {
      throw new Error('Please select at least one character to import');
    }

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
        SELECT DISTINCT u.id, u.battletag
        FROM users u
        LEFT JOIN characters c ON u.id = c.user_id
        WHERE c.guild_id = $1 OR u.active_guild_id = $1
      ),
      past_events AS (
        SELECT e.id, e.title, e.roster_id, r.weight as roster_weight, e.start_time
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
