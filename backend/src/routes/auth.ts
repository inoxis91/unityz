import express from 'express';
import pool from '../lib/db';
import { isAuthenticated } from '../middlewares/auth';
import axios from 'axios';
import { BlizzardService } from '../services/blizzardService';

const router = express.Router();

// Synchronize characters and guilds from Battle.net
router.get('/sync', isAuthenticated, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    const userId = req.user!.id;
    console.log(`[Sync API] Starting sync for user: ${userId} (${req.user!.battletag})`);

    if (!accessToken) {
      console.warn(`[Sync API] Warning: No access token found for user: ${userId}`);
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    // 1. Fetch user's characters from Blizzard
    console.log(`[Sync API] Fetching wow accounts from Blizzard for user ${userId}`);
    const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { namespace: 'profile-eu', locale: 'fr_FR' }
    });

    const accounts = response.data.wow_accounts || [];
    let charactersFromBnet: any[] = [];

    accounts.forEach((account: any) => {
      if (account.characters) {
        charactersFromBnet.push(...account.characters);
      }
    });

    console.log(`[Sync API] Found ${charactersFromBnet.length} characters for user ${userId}`);

    // Filter characters level >= 10 to optimize requests and ignore low level alts
    const eligibleCharacters = charactersFromBnet.filter(char => char.level >= 10 && char.realm && char.realm.slug);
    console.log(`[Sync API] Fetching details for ${eligibleCharacters.length} eligible characters (level >= 10) in parallel...`);

    const characterDetails = await Promise.all(
      eligibleCharacters.map(async (char) => {
        const summary = await BlizzardService.getCharacterSummary(accessToken, char.realm.slug, char.name);
        if (summary) {
          return {
            ...char,
            guild: summary.guild // inject guild info from summary
          };
        }
        return char;
      })
    );

    // We will build a map of guilds to process
    const guildsToProcess = new Map<number, { bnet_id: number, name: string, realm: string, realmSlug: string, nameSlug: string }>();

    characterDetails.forEach(char => {
      if (char.guild && char.guild.id && char.realm) {
        guildsToProcess.set(char.guild.id, {
          bnet_id: char.guild.id,
          name: char.guild.name,
          realm: char.realm.name || 'Inconnu',
          realmSlug: char.realm.slug || '',
          // Extract guild slug 
          nameSlug: char.guild.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') 
        });
      }
    });

    console.log(`[Sync API] Found ${guildsToProcess.size} unique guilds to process for user ${userId}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userGuildsMap = new Map<string, any>(); // guild_id (uuid) -> guild data including rank

      // 2. Process each unique guild
      for (const [bnet_guild_id, guildData] of guildsToProcess.entries()) {
        console.log(`[Sync API] Processing guild: <${guildData.name}> on ${guildData.realm}`);
        // Upsert Guild
        const guildResult = await client.query(`
          INSERT INTO guilds (bnet_guild_id, name, realm)
          VALUES ($1, $2, $3)
          ON CONFLICT (bnet_guild_id) DO UPDATE SET name = EXCLUDED.name, realm = EXCLUDED.realm, updated_at = CURRENT_TIMESTAMP
          RETURNING id, name, subscription_status
        `, [bnet_guild_id, guildData.name, guildData.realm]);
        
        const guildRow = guildResult.rows[0];
        const dbGuildId = guildRow.id;

        // Fetch roster to find user's highest rank in this guild
        let highestRank = 999; // Default low rank
        if (guildData.realmSlug && guildData.nameSlug) {
          console.log(`[Sync API] Fetching guild roster for <${guildData.name}> (slug: ${guildData.nameSlug}) on ${guildData.realmSlug}`);
          const roster = await BlizzardService.getGuildRoster(accessToken, guildData.realmSlug, guildData.nameSlug);
          if (roster && roster.members) {
            roster.members.forEach((member: any) => {
              // Check if this member is one of the user's characters
              const isUsersChar = eligibleCharacters.some(c => c.id === member.character?.id);
              if (isUsersChar && member.rank !== undefined && member.rank < highestRank) {
                highestRank = member.rank;
              }
            });
          }
        }

        console.log(`[Sync API] User rank in guild <${guildData.name}>: ${highestRank === 999 ? 'none/untracked' : highestRank}`);

        userGuildsMap.set(dbGuildId, {
          id: dbGuildId,
          name: guildRow.name,
          realm: guildData.realm,
          subscription_status: guildRow.subscription_status,
          rank: highestRank === 999 ? null : highestRank
        });
      }

      // 3. Upsert Characters and link to guilds
      // First, get the current main to preserve it if possible
      const mainCheck = await client.query('SELECT 1 FROM characters WHERE user_id = $1 AND is_main = TRUE LIMIT 1', [userId]);
      let hasMain = mainCheck.rowCount! > 0;

      console.log(`[Sync API] Upserting characters into DB...`);
      for (const char of characterDetails) {
        if (!char.name) continue; // Safety check

        let charGuildId = null;
        let charGuildRank = null;

        if (char.guild && char.guild.id) {
          const bnetGuildId = char.guild.id;
          // Find the UUID for this bnet_guild_id
          const dbGuildIdResult = await client.query('SELECT id FROM guilds WHERE bnet_guild_id = $1', [bnetGuildId]);
          if (dbGuildIdResult.rowCount! > 0) {
            charGuildId = dbGuildIdResult.rows[0].id;
            const guildData = userGuildsMap.get(charGuildId);
            charGuildRank = guildData ? guildData.rank : null;
          }
        }

        const setAsMain = !hasMain;
        
        await client.query(`
          INSERT INTO characters (user_id, name, realm, class, level, is_main, guild_id, guild_rank)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (name, realm, user_id) 
          DO UPDATE SET 
            level = EXCLUDED.level,
            class = EXCLUDED.class,
            guild_id = EXCLUDED.guild_id,
            guild_rank = EXCLUDED.guild_rank,
            updated_at = CURRENT_TIMESTAMP
        `, [userId, char.name, char.realm?.name || 'Inconnu', (char.character_class?.name || char.playable_class?.name || 'Inconnu'), char.level || 0, setAsMain, charGuildId, charGuildRank]);
        
        if (setAsMain) {
          hasMain = true;
        }
      }

      await client.query('COMMIT');
      console.log(`[Sync API] Sync completed successfully for user ${userId}`);
      
      // Return the array of guilds the user belongs to
      res.json(Array.from(userGuildsMap.values()));

    } catch (dbError: any) {
      console.error(`[Sync API] DB Transaction error for user ${userId}:`, dbError.message, dbError.stack);
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error(`[Sync API] Global sync error:`, error.message, error.stack);
    next(error);
  }
});

// Set the active guild context for the user
router.post('/active-guild', isAuthenticated, async (req, res, next) => {
  try {
    const { guildId } = req.body;
    
    if (!guildId) {
      return res.status(400).json({ message: 'guildId is required' });
    }

    // Verify user actually has characters in this guild
    const checkResult = await pool.query('SELECT 1 FROM characters WHERE user_id = $1 AND guild_id = $2 LIMIT 1', [req.user!.id, guildId]);
    if (checkResult.rowCount === 0) {
      return res.status(403).json({ message: 'User does not belong to this guild' });
    }

    // Update current_guild_id
    await pool.query('UPDATE users SET current_guild_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [guildId, req.user!.id]);
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Mock endpoint to simulate subscription purchase
router.post('/guilds/:id/subscribe', isAuthenticated, async (req, res, next) => {
  try {
    const guildId = req.params.id;
    // Basic verification: user must be GM or Officer
    const checkResult = await pool.query(`
      SELECT guild_rank 
      FROM characters 
      WHERE user_id = $1 AND guild_id = $2 
      ORDER BY guild_rank ASC NULLS LAST 
      LIMIT 1
    `, [req.user!.id, guildId]);
    
    if (checkResult.rowCount === 0 || checkResult.rows[0].guild_rank > 1 || checkResult.rows[0].guild_rank === null) {
      return res.status(403).json({ message: 'Only GM or Officer can subscribe' });
    }

    await pool.query('UPDATE guilds SET subscription_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['active', guildId]);
    res.json({ success: true, status: 'active' });
  } catch (error) {
    next(error);
  }
});

export default router;