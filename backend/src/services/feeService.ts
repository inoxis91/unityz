import pool from '../lib/db';
import { sendDiscordDM, sendFeeDeclarationNotification, sendDiscordChannelMessage } from '../lib/discord';
import { t, getDiscordLocale } from '../lib/i18n';

export interface FeeDeclaration {
  id: string;
  user_id: string;
  battletag?: string;
  amount: number;
  start_month: string;
  duration_months: number;
  comment: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  admin_comment: string | null;
  created_at: Date;
}

export interface FeeAllocation {
  id: string;
  user_id: string;
  month_date: string;
  amount: number;
}

export class FeeService {
  static async declarePayment(userId: string, data: any, guildId: string): Promise<FeeDeclaration> {
    const query = `
      INSERT INTO fee_declarations (user_id, amount, start_month, duration_months, comment, guild_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await pool.query(query, [userId, data.amount, data.start_month, data.duration_months, data.comment, guildId]);
    const declaration = result.rows[0];

    // Fetch guild Discord settings
    const guildRes = await pool.query('SELECT discord_enabled, discord_fees_channel_id, discord_locale FROM guilds WHERE id = $1', [guildId]);
    const guildSettings = guildRes.rows[0];

    if (guildSettings && guildSettings.discord_enabled && guildSettings.discord_fees_channel_id) {
      // Fetch user info and characters for notification
      const userQuery = `
        SELECT u.battletag,
               (SELECT name FROM characters WHERE user_id = u.id AND is_main = true LIMIT 1) as main_character,
               (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) FROM characters WHERE user_id = u.id) as characters
        FROM users u
        WHERE u.id = $1
      `;
      const userResult = await pool.query(userQuery, [userId]);
      const userInfo = userResult.rows[0];

      if (userInfo) {
        await sendFeeDeclarationNotification(declaration, {
          battletag: userInfo.battletag,
          mainCharacter: userInfo.main_character,
          characters: userInfo.characters || []
        }, guildSettings.discord_fees_channel_id, guildSettings.discord_locale || 'en');
      }
    }

    return declaration;
  }

  static async getUserDeclarations(userId: string): Promise<FeeDeclaration[]> {
    const query = 'SELECT * FROM fee_declarations WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async getUserAllocations(userId: string, year: number): Promise<FeeAllocation[]> {
    const query = `
      SELECT * FROM fee_allocations 
      WHERE user_id = $1 
      AND EXTRACT(YEAR FROM month_date) = $2
      ORDER BY month_date ASC
    `;
    const result = await pool.query(query, [userId, year]);
    return result.rows;
  }

  static async getPendingDeclarations(guildId?: string): Promise<FeeDeclaration[]> {
    let query = `
      SELECT fd.*, u.battletag,
             (SELECT name FROM characters WHERE user_id = fd.user_id AND is_main = true LIMIT 1) as main_character,
             (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) FROM characters WHERE user_id = fd.user_id) as characters
      FROM fee_declarations fd
      JOIN users u ON fd.user_id = u.id
    `;
    const params: any[] = [];
    if (guildId) {
      query += ' WHERE fd.guild_id = $1 AND fd.status = \'pending\'';
      params.push(guildId);
    } else {
      query += ' WHERE fd.status = \'pending\'';
    }
    query += ' ORDER BY fd.created_at ASC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getGuildOverview(year: number, guildId?: string): Promise<any[]> {
    if (!guildId) {
      const query = `
        SELECT u.id as user_id, u.battletag, 
               (SELECT name FROM characters WHERE user_id = u.id AND is_main = true LIMIT 1) as main_character,
               (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) FROM characters WHERE user_id = u.id) as characters,
               COALESCE(JSON_AGG(json_build_object('month', fa.month_date, 'amount', fa.amount)) FILTER (WHERE fa.month_date IS NOT NULL), '[]'::json) as allocations
        FROM users u
        LEFT JOIN fee_allocations fa ON u.id = fa.user_id AND EXTRACT(YEAR FROM fa.month_date) = $1
        GROUP BY u.id, u.battletag
        ORDER BY u.battletag ASC
      `;
      const result = await pool.query(query, [year]);
      return result.rows;
    }

    const query = `
      SELECT u.id as user_id, u.battletag, 
             (SELECT name FROM characters WHERE user_id = u.id AND is_main = true AND guild_id = $2 LIMIT 1) as main_character,
             (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) FROM characters WHERE user_id = u.id AND guild_id = $2) as characters,
             COALESCE(JSON_AGG(json_build_object('month', fa.month_date, 'amount', fa.amount)) FILTER (WHERE fa.month_date IS NOT NULL), '[]'::json) as allocations
      FROM users u
      JOIN characters c ON u.id = c.user_id AND c.guild_id = $2
      LEFT JOIN fee_allocations fa ON u.id = fa.user_id AND EXTRACT(YEAR FROM fa.month_date) = $1 AND fa.guild_id = $2
      GROUP BY u.id, u.battletag
      ORDER BY u.battletag ASC
    `;
    const result = await pool.query(query, [year, guildId]);
    return result.rows;
  }

  static async resolveDeclaration(id: string, status: 'accepted' | 'rejected', adminComment: string | null): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update declaration status
      const declQuery = `
        UPDATE fee_declarations 
        SET status = $1, admin_comment = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      const declResult = await client.query(declQuery, [status, adminComment, id]);
      
      if (declResult.rowCount === 0) throw new Error('Declaration not found');
      const decl = declResult.rows[0];

      // Fetch user discord_id
      const userQuery = 'SELECT discord_id FROM users WHERE id = $1';
      const userResult = await client.query(userQuery, [decl.user_id]);
      const discordId = userResult.rows[0]?.discord_id;

      // 2. If accepted, create allocations
      if (status === 'accepted') {
        const monthlyAmount = Math.floor(decl.amount / decl.duration_months);
        
        // Robust date parsing (handles both Date objects from PG and strings)
        const startDate = new Date(decl.start_month);
        const year = startDate.getUTCFullYear();
        const month = startDate.getUTCMonth(); // 0-indexed
        
        for (let i = 0; i < decl.duration_months; i++) {
          const allocDate = new Date(Date.UTC(year, month + i, 1));
          const monthStr = allocDate.toISOString().split('T')[0];

          const allocQuery = `
            INSERT INTO fee_allocations (user_id, month_date, amount, guild_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, month_date, guild_id) 
            DO UPDATE SET 
              amount = fee_allocations.amount + EXCLUDED.amount,
              updated_at = CURRENT_TIMESTAMP
          `;
          await client.query(allocQuery, [decl.user_id, monthStr, monthlyAmount, decl.guild_id]);
        }
      }

      await client.query('COMMIT');

      // 3. Send Discord Notification (Outside transaction)
      if (discordId) {
        // Fetch guild locale
        const guildQuery = 'SELECT discord_locale FROM guilds WHERE id = $1';
        const guildResult = await pool.query(guildQuery, [decl.guild_id]);
        const locale = getDiscordLocale(guildResult.rows[0]);

        const startMonthStr = new Date(decl.start_month).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });

        const msg = status === 'accepted'
          ? t(locale, 'discord.fees.dm.approved', {
              amount: decl.amount.toString(),
              duration: decl.duration_months.toString(),
              date: startMonthStr
            })
          : t(locale, 'discord.fees.dm.rejected', {
              amount: decl.amount.toString(),
              duration: decl.duration_months.toString(),
              date: startMonthStr,
              reason: adminComment || t(locale, 'discord.fees.dm.unspecified_reason')
            });

        await sendDiscordDM(discordId, msg);
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async sendPaymentReminders(guildId?: string): Promise<{ 
    notifiedCount: number; 
    messageSent: boolean; 
    lateCount: number;
    error?: string;
    discordEnabled: boolean;
    channelConfigured: boolean;
  }> {
    let notifiedCount = 0;
    let messageSent = false;
    let lateCount = 0;

    // First, if guildId is provided, let's fetch its Discord settings directly to give highly descriptive errors
    if (guildId) {
      const checkRes = await pool.query(
        'SELECT discord_enabled, discord_reminder_channel_id, minimum_fee_amount FROM guilds WHERE id = $1',
        [guildId]
      );
      const guild = checkRes.rows[0];
      if (!guild) {
        return { notifiedCount: 0, messageSent: false, lateCount: 0, error: 'GUILD_NOT_FOUND', discordEnabled: false, channelConfigured: false };
      }
      if (!guild.discord_enabled) {
        return { notifiedCount: 0, messageSent: false, lateCount: 0, error: 'DISCORD_DISABLED', discordEnabled: false, channelConfigured: !!guild.discord_reminder_channel_id };
      }
      if (!guild.discord_reminder_channel_id) {
        return { notifiedCount: 0, messageSent: false, lateCount: 0, error: 'CHANNEL_NOT_CONFIGURED', discordEnabled: true, channelConfigured: false };
      }
    }

    // Fetch guilds to process
    let queryGuilds = `
      SELECT id, discord_reminder_channel_id, minimum_fee_amount, discord_enabled, discord_locale
      FROM guilds 
      WHERE discord_enabled = TRUE 
        AND discord_reminder_channel_id IS NOT NULL
    `;
    const paramsGuilds: any[] = [];

    if (guildId) {
      queryGuilds += ` AND id = $1`;
      paramsGuilds.push(guildId);
    } else {
      // For cron job (all active pro guilds)
      queryGuilds += ` AND subscription_tier = 'pro' AND subscription_expires_at > CURRENT_TIMESTAMP`;
    }

    const guildsRes = await pool.query(queryGuilds, paramsGuilds);

    for (const guild of guildsRes.rows) {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}-01`;

      // Find users with allocations < minimum_fee_amount for the current month in this guild
      const queryUsers = `
        SELECT DISTINCT u.discord_id, u.battletag
        FROM users u
        JOIN characters c ON u.id = c.user_id AND c.guild_id = $1
        LEFT JOIN fee_allocations fa ON u.id = fa.user_id AND fa.month_date = $2::DATE AND fa.guild_id = $1
        WHERE (fa.amount IS NULL OR fa.amount < $3)
      `;
      const result = await pool.query(queryUsers, [guild.id, monthStr, guild.minimum_fee_amount]);
      const lateUsers = result.rows;
      lateCount = lateUsers.length;

      if (lateUsers.length > 0) {
        const mentions = lateUsers.map(u => 
          u.discord_id && u.discord_id.trim() !== '' 
            ? `<@${u.discord_id}>` 
            : `**${u.battletag ? u.battletag.split('#')[0] : 'Membre'}**`
        ).join(', ');

        const locale = getDiscordLocale(guild);
        const message = t(locale, 'discord.fees.reminder.message', {
          minAmount: guild.minimum_fee_amount.toString(),
          mentions: mentions
        });

        const sent = await sendDiscordChannelMessage(guild.discord_reminder_channel_id, message);
        if (sent) {
          messageSent = true;
          notifiedCount += lateUsers.length;
        } else {
          return { notifiedCount: 0, messageSent: false, lateCount, error: 'DISCORD_SEND_FAILED', discordEnabled: true, channelConfigured: true };
        }
      }
    }

    return { notifiedCount, messageSent, lateCount, discordEnabled: true, channelConfigured: true };
  }

  static async upsertAllocation(userId: string, monthDate: string, amount: number, guildId: string): Promise<void> {
    const query = `
      INSERT INTO fee_allocations (user_id, month_date, amount, guild_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, month_date, guild_id) 
      DO UPDATE SET 
        amount = EXCLUDED.amount,
        updated_at = CURRENT_TIMESTAMP
    `;
    await pool.query(query, [userId, monthDate, amount, guildId]);
  }
}
