import pool from '../lib/db';
import { sendDiscordChannelMessage } from '../lib/discord';

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

  static async getAll(): Promise<Event[]> {
    const query = `
      SELECT e.id, e.title, e.description, 
             to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             to_char(e.end_time, 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             e.type, e.roster_id, e.mm_groups_count, e.created_by,
             r.name as roster_name, r.weight as roster_weight
      FROM events e
      LEFT JOIN rosters r ON e.roster_id = r.id
      ORDER BY e.start_time ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async getById(id: string): Promise<Event | null> {
    const query = `
      SELECT e.id, e.title, e.description, 
             to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             to_char(e.end_time, 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             e.type, e.roster_id, e.mm_groups_count, e.created_by,
             r.name as roster_name, r.weight as roster_weight
      FROM events e
      LEFT JOIN rosters r ON e.roster_id = r.id
      WHERE e.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async create(data: Partial<Event>, userId: string): Promise<Event> {
    const query = `
      INSERT INTO events (title, description, start_time, end_time, type, roster_id, mm_groups_count, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
      userId
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
    const channelId = process.env.DISCORD_EVENTS_CHANNEL_ID || '1509267337147056249';
    
    const startTime = new Date(event.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const startDate = new Date(event.start_time).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const typeIcon = event.type.toLowerCase() === 'raid' ? '⚔️' : '💎';
    
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (frontendUrl.endsWith('/')) frontendUrl = frontendUrl.slice(0, -1);
    const eventLink = `${frontendUrl}/events/${event.id}`;

    // Mise en avant du roster
    const rosterTag = event.roster_name 
      ? `🔴 **ROSTER : ${event.roster_name.toUpperCase()}** 🔴` 
      : `🟢 **OUVERT À TOUS** 🟢`;

    let message = `🆕 **NOUVEL ÉVÉNEMENT CRÉÉ !**\n`;
    message += `Venez nombreux vous inscrire pour faire briller la guilde ! 🚀\n\n`;
    message += `${rosterTag}\n`;
    message += `------------------------------------------\n`;
    message += `\n${typeIcon} **${event.title}**\n`;
    message += `📅 Date : ${startDate}\n`;
    message += `⏰ Heure : ${startTime}\n`;
    message += `📝 Type : ${event.type}\n`;
    if (event.description) {
      message += `📖 Description : ${event.description}\n`;
    }
    message += `🔗 **S'inscrire ici :** ${eventLink}\n`;
    message += `------------------------------------------\n`;
    message += `\nOn compte sur vous ! 🔥`;

    await sendDiscordChannelMessage(channelId, message);
  }

  static async update(id: string, data: Partial<Event>): Promise<Event | null> {
    const query = `
      UPDATE events 
      SET title = $1, description = $2, start_time = $3, end_time = $4, type = $5, roster_id = $6, mm_groups_count = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
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
             s.created_at as signup_date
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

  static formatReminderMessage(event: Event, isManual: boolean = false, standbyMentions: string[] = []): string {
    const startTime = new Date(event.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const startDate = new Date(event.start_time).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const typeIcon = event.type.toLowerCase() === 'raid' ? '⚔️' : '💎';
    const rosterInfo = event.roster_name ? ` (Roster: ${event.roster_name})` : '';
    
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (frontendUrl.endsWith('/')) frontendUrl = frontendUrl.slice(0, -1);
    const eventLink = `${frontendUrl}/events/${event.id}`;

    let message = isManual ? `📣 **RAPPEL D'ÉVÉNEMENT**\n` : `📅 **ÉVÉNEMENTS DU JOUR**\n`;
    message += '------------------------------------------\n';
    message += `\n${typeIcon} **${event.title}**\n`;
    if (isManual) message += `📅 Date : ${startDate}\n`;
    message += `⏰ Heure : ${startTime}\n`;
    message += `📝 Type : ${event.type}${rosterInfo}\n`;
    if (event.description) {
      message += `📖 Description : ${event.description}\n`;
    }
    message += `🔗 **Lien :** ${eventLink}\n`;
    message += '------------------------------------------\n';

    if (standbyMentions.length > 0) {
      message += `\n⚠️ **Rappel aux "Peut-être" :**\n${standbyMentions.join(', ')}\nMerci de confirmer votre présence dès que possible ! 🙏\n`;
    }

    return message;
  }

  static async sendManualReminder(eventId: string): Promise<void> {
    const event = await this.getById(eventId);
    if (!event) throw new Error('Event not found');

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

    const channelId = process.env.DISCORD_EVENTS_CHANNEL_ID || '1509267337147056249';
    let message = this.formatReminderMessage(event, true, mentions);
    
    if (mentions.length === 0) {
      message += '\nN\'oubliez pas de vous inscrire sur le site ! 🚀';
    }

    await sendDiscordChannelMessage(channelId, message);
  }

  static async sendDailyReminders(date: Date): Promise<void> {
    const events = await this.getEventsForDate(date);
    if (events.length === 0) return;

    const channelId = process.env.DISCORD_EVENTS_CHANNEL_ID || '1509267337147056249';
    let fullMessage = '📅 **ÉVÉNEMENTS DU JOUR**\n';
    fullMessage += '------------------------------------------\n';

    for (const event of events) {
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

      fullMessage += `\n${this.formatReminderMessage(event, false, mentions)}`;
    }

    await sendDiscordChannelMessage(channelId, fullMessage);
  }
}
