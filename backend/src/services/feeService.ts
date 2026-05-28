import pool from '../lib/db';
import { sendDiscordDM, sendFeeDeclarationNotification } from '../lib/discord';

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
  static async declarePayment(userId: string, data: any): Promise<FeeDeclaration> {
    const query = `
      INSERT INTO fee_declarations (user_id, amount, start_month, duration_months, comment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(query, [userId, data.amount, data.start_month, data.duration_months, data.comment]);
    const declaration = result.rows[0];

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
      });
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

  static async getPendingDeclarations(): Promise<FeeDeclaration[]> {
    const query = `
      SELECT fd.*, u.battletag,
             (SELECT name FROM characters WHERE user_id = fd.user_id AND is_main = true LIMIT 1) as main_character,
             (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) FROM characters WHERE user_id = fd.user_id) as characters
      FROM fee_declarations fd
      JOIN users u ON fd.user_id = u.id
      WHERE fd.status = 'pending'
      ORDER BY fd.created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async getGuildOverview(year: number): Promise<any[]> {
    const query = `
      SELECT u.id as user_id, u.battletag, 
             (SELECT name FROM characters WHERE user_id = u.id AND is_main = true LIMIT 1) as main_character,
             (SELECT json_agg(json_build_object('name', name, 'realm', realm, 'class', class, 'is_main', is_main)) FROM characters WHERE user_id = u.id) as characters,
             JSON_AGG(json_build_object('month', month_date, 'amount', amount)) as allocations
      FROM users u
      LEFT JOIN fee_allocations fa ON u.id = fa.user_id AND EXTRACT(YEAR FROM fa.month_date) = $1
      GROUP BY u.id, u.battletag
      ORDER BY u.battletag ASC
    `;
    const result = await pool.query(query, [year]);
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
            INSERT INTO fee_allocations (user_id, month_date, amount)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, month_date) 
            DO UPDATE SET 
              amount = fee_allocations.amount + EXCLUDED.amount,
              updated_at = CURRENT_TIMESTAMP
          `;
          await client.query(allocQuery, [decl.user_id, monthStr, monthlyAmount]);
        }
      }

      await client.query('COMMIT');

      // 3. Send Discord Notification (Outside transaction)
      if (discordId) {
        const msg = status === 'accepted' 
          ? `✅ Votre paiement de **${decl.amount} PO** a été approuvé !`
          : `❌ Votre paiement de **${decl.amount} PO** a été rejeté.\nMotif : ${adminComment || 'Non spécifié'}`;
        await sendDiscordDM(discordId, msg);
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async upsertAllocation(userId: string, monthDate: string, amount: number): Promise<void> {
    const query = `
      INSERT INTO fee_allocations (user_id, month_date, amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, month_date) 
      DO UPDATE SET 
        amount = EXCLUDED.amount,
        updated_at = CURRENT_TIMESTAMP
    `;
    await pool.query(query, [userId, monthDate, amount]);
  }
}
