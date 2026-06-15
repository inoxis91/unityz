import pool from '../lib/db';
import { sendDiscordChannelMessage } from '../lib/discord';
import { t, getDiscordLocale, SupportedDiscordLocale } from '../lib/i18n';

export interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  type: string;
  roster_id: string | null;
  mm_groups_count: number;
  roster_name?: string | null;
  roster_weight?: number | null;
  created_by: string;
  guild_id?: string;
  invited_groups?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Signup {
  id: string;
  event_id: string;
  user_id: string;
  character_id: string | null;
  role: string;
  status: string;
  group_index: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
  character_name?: string;
  character_class?: string;
  main_character_name?: string;
  main_character_class?: string;
  battletag?: string;
  signup_date?: Date;
  user_characters?: any[]; // For alts view
}

export class EventService {
  static async getMySignups(userId: string): Promise<Signup[]> {
    const query = 'SELECT * FROM event_signups WHERE user_id = $1';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async getAll(guildId?: string, userRole?: string): Promise<Event[]> {
    let query = `
      SELECT e.id, e.title, e.description, 
             to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             to_char(e.end_time, 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             e.type, e.roster_id, e.mm_groups_count, e.created_by, e.invited_groups,
             r.name as roster_name, r.weight as roster_weight
      FROM events e
      LEFT JOIN rosters r ON e.roster_id = r.id
    `;
    const params: any[] = [];
    if (guildId) {
      query += ' WHERE e.guild_id = $1';
      params.push(guildId);
    }
    query += ' ORDER BY e.start_time ASC';
    const result = await pool.query(query, params);
    const events = result.rows;

    if (!userRole) return events;

    return events.filter(e => {
      if (e.type !== 'reunion') return true;
      if (!e.invited_groups || e.invited_groups.length === 0) return true;
      if (e.invited_groups.includes('all')) return true;
      if (userRole === 'admin') return true;
      return e.invited_groups.includes(userRole);
    });
  }

  static async getById(id: string): Promise<Event | null> {
    const query = `
      SELECT e.id, e.title, e.description, 
             to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             to_char(e.end_time, 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             e.type, e.roster_id, e.mm_groups_count, e.created_by, e.guild_id, e.invited_groups,
             r.name as roster_name, r.weight as roster_weight
      FROM events e
      LEFT JOIN rosters r ON e.roster_id = r.id
      WHERE e.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async create(data: Partial<Event>, userId: string, guildId: string): Promise<Event> {
    const query = `
      INSERT INTO events (title, description, start_time, end_time, type, roster_id, mm_groups_count, created_by, guild_id, invited_groups)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const result = await pool.query(query, [
      data.title, 
      data.description, 
      data.start_time, 
      data.end_time, 
      data.type, 
      data.roster_id || null, 
      data.mm_groups_count || 0,
      userId,
      guildId,
      data.invited_groups || []
    ]);
    
    const createdEvent = result.rows[0];

    // On récupère l'event complet (avec les infos du roster) pour la notification
    const fullEvent = await this.getById(createdEvent.id);
    if (fullEvent) {
      this.sendCreationNotification(fullEvent).catch(err => 
        console.error('[Discord] Error sending creation notification:', err)
      );
    }

    return createdEvent;
  }

  static async sendCreationNotification(event: Event): Promise<void> {
    if (!event.guild_id) return;

    // Fetch guild Discord settings
    const guildRes = await pool.query(
      'SELECT discord_enabled, discord_events_channel_id, discord_officer_channel_id, discord_locale FROM guilds WHERE id = $1', 
      [event.guild_id]
    );
    const guild = guildRes.rows[0];

    if (!guild || !guild.discord_enabled) {
      return; // Skip if Discord is disabled
    }

    let channelId: string | null = null;
    
    // For 'reunion', if 'all' is invited, notify the events channel. Otherwise, notify the officer channel.
    if (event.type === 'reunion') {
      const invited = event.invited_groups || [];
      if (invited.includes('all')) {
        channelId = guild.discord_events_channel_id;
      } else {
        channelId = guild.discord_officer_channel_id;
      }
    } else {
      channelId = guild.discord_events_channel_id;
    }

    if (!channelId) {
      console.warn(`[Discord] Notification channel not set for event type ${event.type}, skipping notification`);
      return; // Skip if channel not set
    }
    
    const locale = getDiscordLocale(guild);
    const startTime = new Date(event.start_time).toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    const startDate = new Date(event.start_time).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    
    let typeIcon = '💎';
    if (event.type.toLowerCase() === 'raid') {
      typeIcon = '⚔️';
    } else if (event.type.toLowerCase() === 'reunion') {
      typeIcon = '👥';
    }
    
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (frontendUrl.endsWith('/')) frontendUrl = frontendUrl.slice(0, -1);
    const eventLink = `${frontendUrl}/events/${event.id}`;

    // Mise en avant du roster / groupe invité
    let rosterTag = '';
    if (event.type === 'reunion') {
      const invited = event.invited_groups || [];
      if (invited.includes('all')) {
        rosterTag = t(locale, 'discord.event.roster_all');
      } else {
        const roleNames = invited.map(r => {
          if (r === 'admin') return 'Admin';
          if (r === 'raid_leader') return 'Raid Leader';
          if (r === 'treasurer') return locale === 'fr' ? 'Trésorier' : 'Treasurer';
          if (r === 'event_manager') return 'Event Manager';
          return r;
        });
        rosterTag = t(locale, 'discord.event.roster_private', { roles: roleNames.join(', ').toUpperCase() });
      }
    } else {
      rosterTag = event.roster_name 
        ? t(locale, 'discord.event.roster_tag', { rosterName: event.roster_name.toUpperCase() }) 
        : t(locale, 'discord.event.roster_open_all');
    }

    let titleKey = 'discord.event.new_title';
    if (event.type === 'reunion') {
      if (!event.invited_groups?.includes('all')) {
        titleKey = 'discord.event.new_private_reunion';
      } else {
        titleKey = 'discord.event.new_reunion';
      }
    }

    let message = `${t(locale, titleKey)}\n`;
    message += `${t(locale, 'discord.event.intro')}\n\n`;
    message += `${rosterTag}\n`;
    message += `------------------------------------------\n`;
    message += `\n${typeIcon} **${event.title}**\n`;
    message += `${t(locale, 'discord.event.label_date')} : ${startDate}\n`;
    message += `${t(locale, 'discord.event.label_time')} : ${startTime}\n`;
    message += `${t(locale, 'discord.event.label_type')} : ${event.type === 'reunion' ? t(locale, 'discord.event.label_reunion') : event.type}\n`;
    if (event.description) {
      message += `${t(locale, 'discord.event.label_description')} : ${event.description}\n`;
    }
    message += `${t(locale, 'discord.event.label_register_here')} ${eventLink}\n`;
    message += `------------------------------------------\n`;
    message += `\n${t(locale, 'discord.event.outro')}`;

    await sendDiscordChannelMessage(channelId, message);
  }

  static async update(id: string, data: Partial<Event>): Promise<Event | null> {
    const query = `
      UPDATE events 
      SET title = $1, description = $2, start_time = $3, end_time = $4, type = $5, roster_id = $6, mm_groups_count = $7, invited_groups = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `;
    const result = await pool.query(query, [
      data.title, 
      data.description, 
      data.start_time, 
      data.end_time, 
      data.type, 
      data.roster_id || null, 
      data.mm_groups_count ?? 0,
      data.invited_groups || [],
      id
    ]);
    return result.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM events WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  static async getSignups(eventId: string): Promise<Signup[]> {
    const query = `
      SELECT s.*, 
             c.name as character_name, c.class as character_class, c.realm as character_realm,
             mc.name as main_character_name, mc.class as main_character_class, mc.realm as main_character_realm,
             u.battletag,
             s.updated_at as signup_date
      FROM event_signups s 
      LEFT JOIN characters c ON s.character_id = c.id 
      LEFT JOIN (
        SELECT DISTINCT ON (user_id) user_id, name, class, realm 
        FROM characters 
        WHERE is_main = TRUE 
        ORDER BY user_id, updated_at DESC
      ) mc ON s.user_id = mc.user_id
      JOIN users u ON s.user_id = u.id 
      WHERE s.event_id = $1
      ORDER BY s.created_at ASC
    `;
    const result = await pool.query(query, [eventId]);
    const signups = result.rows;

    // Fetch all characters for each user to show alts in frontend
    for (const signup of signups) {
      const charQuery = `
        SELECT c.id, c.name, c.realm, c.class, c.is_tank, c.is_heal, c.is_dps, c.is_main,
               r.name as roster_name
        FROM characters c
        LEFT JOIN rosters r ON c.roster_id = r.id
        WHERE c.user_id = $1 
        ORDER BY c.is_main DESC, c.name ASC
      `;
      const charResult = await pool.query(charQuery, [signup.user_id]);
      signup.user_characters = charResult.rows;
    }

    return signups;
  }

  static async signup(eventId: string, userId: string, data: any): Promise<Signup> {
    const charId = data.character_id && data.character_id !== '' ? data.character_id : null;
    const query = `
      INSERT INTO event_signups (event_id, user_id, character_id, role, comment, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_id, user_id) 
      DO UPDATE SET 
        character_id = EXCLUDED.character_id, 
        role = EXCLUDED.role, 
        comment = EXCLUDED.comment, 
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await pool.query(query, [eventId, userId, charId, data.role, data.comment, data.status || 'signed_up']);
    return result.rows[0];
  }

  static async unsignup(eventId: string, userId: string): Promise<boolean> {
    const query = 'DELETE FROM event_signups WHERE event_id = $1 AND user_id = $2';
    const result = await pool.query(query, [eventId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  static async updateSignupGroup(eventId: string, userId: string, groupIndex: number): Promise<boolean> {
    const query = 'UPDATE event_signups SET group_index = $1, updated_at = CURRENT_TIMESTAMP WHERE event_id = $2 AND user_id = $3';
    const result = await pool.query(query, [groupIndex, eventId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  static async updateGroupsCount(eventId: string, count: number): Promise<boolean> {
    const query = 'UPDATE events SET mm_groups_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    const result = await pool.query(query, [count, eventId]);
    return (result.rowCount ?? 0) > 0;
  }

  static async getEventsForDate(date: Date): Promise<Event[]> {
    const query = `
      SELECT e.*, r.name as roster_name
      FROM events e
      LEFT JOIN rosters r ON e.roster_id = r.id
      WHERE e.start_time::date = $1::date
      ORDER BY e.start_time ASC
    `;
    const result = await pool.query(query, [date.toISOString().split('T')[0]]);
    return result.rows;
  }

  static formatReminderMessage(event: Event, isManual: boolean = false, standbyMentions: string[] = [], locale: SupportedDiscordLocale = 'en'): string {
    const startTime = new Date(event.start_time).toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    const startDate = new Date(event.start_time).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    const typeIcon = event.type.toLowerCase() === 'raid' ? '⚔️' : '💎';
    const rosterInfo = event.roster_name ? ` (Roster: ${event.roster_name})` : '';
    
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (frontendUrl.endsWith('/')) frontendUrl = frontendUrl.slice(0, -1);
    const eventLink = `${frontendUrl}/events/${event.id}`;

    let message = '';
    if (isManual) {
      message += `${t(locale, 'discord.event.label_manual_reminder')}\n`;
      message += '------------------------------------------\n';
    }
    message += `\n${typeIcon} **${event.title}**\n`;
    if (isManual) message += `${t(locale, 'discord.event.label_date')} : ${startDate}\n`;
    message += `${t(locale, 'discord.event.label_time')} : ${startTime}\n`;
    message += `${t(locale, 'discord.event.label_type')} : ${event.type}${rosterInfo}\n`;
    if (event.description) {
      message += `${t(locale, 'discord.event.label_description')} : ${event.description}\n`;
    }
    message += `${t(locale, 'discord.event.label_link')} ${eventLink}\n`;
    message += '------------------------------------------\n';

    if (standbyMentions.length > 0) {
      message += `\n${t(locale, 'discord.event.label_maybe_reminder')}\n${standbyMentions.join(', ')}\n${t(locale, 'discord.event.label_maybe_outro')}\n`;
    }

    return message;
  }

  static async sendManualReminder(eventId: string): Promise<void> {
    const event = await this.getById(eventId);
    if (!event) throw new Error('Event not found');
    if (!event.guild_id) return;

    // Fetch guild Discord settings
    const guildRes = await pool.query('SELECT discord_enabled, discord_events_channel_id, discord_locale FROM guilds WHERE id = $1', [event.guild_id]);
    const guild = guildRes.rows[0];

    if (!guild || !guild.discord_enabled || !guild.discord_events_channel_id) {
      return; // Skip if Discord disabled or channel not set
    }

    // Récupérer les personnes en "standby" (peut-être) avec leur Discord ID ou BattleTag en secours
    const standbyQuery = `
      SELECT u.discord_id, u.battletag FROM users u
      JOIN event_signups s ON u.id = s.user_id
      WHERE s.event_id = $1 AND s.status = 'standby'
    `;
    const standbyRes = await pool.query(standbyQuery, [eventId]);
    const mentions = standbyRes.rows.map(r => {
      if (r.discord_id) return `<@${r.discord_id}>`;
      return `**${r.battletag.split('#')[0]}**`;
    });

    const locale = getDiscordLocale(guild);
    const channelId = guild.discord_events_channel_id;
    let message = this.formatReminderMessage(event, true, mentions, locale);
    
    if (mentions.length === 0) {
      message += `\n${t(locale, 'discord.event.label_register_reminder_outro')}`;
    }

    await sendDiscordChannelMessage(channelId, message);
  }

  static async sendDailyReminders(date: Date): Promise<void> {
    const events = await this.getEventsForDate(date);
    if (events.length === 0) return;

    // Group events by guild_id to send isolated reminders per guild
    const eventsByGuild: Record<string, Event[]> = {};
    for (const event of events) {
      if (event.guild_id) {
        if (!eventsByGuild[event.guild_id]) {
          eventsByGuild[event.guild_id] = [];
        }
        eventsByGuild[event.guild_id].push(event);
      }
    }

    for (const [guildId, guildEvents] of Object.entries(eventsByGuild)) {
      const guildRes = await pool.query('SELECT discord_enabled, discord_events_channel_id, discord_locale FROM guilds WHERE id = $1', [guildId]);
      const guild = guildRes.rows[0];

      if (!guild || !guild.discord_enabled || !guild.discord_events_channel_id) {
        continue; // Skip guild if Discord is disabled or channel not set
      }

      const locale = getDiscordLocale(guild);
      let fullMessage = `${t(locale, 'discord.event.label_daily_events_title')}\n`;
      fullMessage += '------------------------------------------\n';

      for (const event of guildEvents) {
        const standbyQuery = `
          SELECT u.discord_id, u.battletag FROM users u
          JOIN event_signups s ON u.id = s.user_id
          WHERE s.event_id = $1 AND s.status = 'standby'
        `;
        const standbyRes = await pool.query(standbyQuery, [event.id]);
        const mentions = standbyRes.rows.map(r => {
          if (r.discord_id) return `<@${r.discord_id}>`;
          return `**${r.battletag.split('#')[0]}**`;
        });

        fullMessage += `\n${this.formatReminderMessage(event, false, mentions, locale)}`;
      }

      await sendDiscordChannelMessage(guild.discord_events_channel_id, fullMessage);
    }
  }
}
