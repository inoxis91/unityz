import { PoolClient } from 'pg';
import pool, { withTransaction } from '../lib/db';
import { HttpError } from '../middlewares/errorHandler';
import { isGuildModerator } from '../middlewares/auth';
import type {
  ApplyHelpPostInput,
  CreateHelpPostInput,
  HelpCategory,
  HelpKind,
  HelpRole,
  UpdateHelpPostInput,
} from '../schemas/guildHelpSchemas';

/** Annonces ouvertes simultanément par membre (anti-spam). */
export const MAX_OPEN_POSTS_PER_USER = 5;
const MAX_LISTED_POSTS = 200;
const MAX_LISTED_PAIRS = 500;

export interface HelpPost {
  id: string;
  kind: HelpKind;
  category: HelpCategory;
  target_role: HelpRole | null;
  title: string;
  description: string;
  capacity: number;
  created_at: string;
  author_user_id: string;
  author_battletag: string;
  author_character_id: string | null;
  author_character_name: string | null;
  author_character_class: string | null;
  active_pairs: number;
  pending_count: number;
  my_application_status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | null;
}

export interface HelpApplication {
  id: string;
  post_id: string;
  user_id: string;
  battletag: string;
  character_name: string | null;
  character_class: string | null;
  message: string;
  created_at: string;
}

export interface HelpPair {
  id: string;
  post_id: string | null;
  post_title: string | null;
  category: HelpCategory;
  started_at: string;
  helper_user_id: string;
  helper_battletag: string;
  helper_character_name: string | null;
  helper_character_class: string | null;
  helped_user_id: string;
  helped_battletag: string;
  helped_character_name: string | null;
  helped_character_class: string | null;
  /** Discord de l'autre membre, exposé uniquement aux deux membres du binôme. */
  partner_discord_id: string | null;
}

export interface HelpOverview {
  posts: HelpPost[];
  /** Candidatures en attente sur les annonces du membre connecté. */
  applications: HelpApplication[];
  pairs: HelpPair[];
}

interface LockedPost {
  id: string;
  author_user_id: string;
  kind: HelpKind;
  category: HelpCategory;
  character_id: string | null;
  capacity: number;
  status: 'open' | 'closed';
}

/**
 * Personnage affiché pour un membre : celui choisi s'il appartient toujours à la guilde,
 * sinon son main, sinon le plus récent.
 */
const characterLateral = (alias: string, userCol: string, chosenCol: string, guildCol: string) => `
  LEFT JOIN LATERAL (
    SELECT c.name, c.class FROM characters c
    WHERE c.user_id = ${userCol} AND c.guild_id = ${guildCol}
    ORDER BY (c.id = ${chosenCol}) IS TRUE DESC, c.is_main DESC, c.updated_at DESC
    LIMIT 1
  ) ${alias} ON TRUE`;

const ISO = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS')`;

export class GuildHelpService {
  static async overview(guildId: string, userId: string): Promise<HelpOverview> {
    const [posts, applications, pairs] = await Promise.all([
      this.listPosts(guildId, userId),
      this.listPendingApplicationsForAuthor(guildId, userId),
      this.listActivePairs(guildId, userId),
    ]);
    return { posts, applications, pairs };
  }

  private static async listPosts(guildId: string, userId: string, postId?: string): Promise<HelpPost[]> {
    const { rows } = await pool.query<HelpPost>(
      `SELECT p.id, p.kind, p.category, p.target_role, p.title, p.description, p.capacity,
              ${ISO('p.created_at')} AS created_at,
              p.author_user_id, u.battletag AS author_battletag, p.character_id AS author_character_id,
              ac.name AS author_character_name, ac.class AS author_character_class,
              COALESCE(pc.active, 0)::int AS active_pairs,
              COALESCE(ap.pending, 0)::int AS pending_count,
              mine.status AS my_application_status
       FROM help_posts p
       JOIN users u ON u.id = p.author_user_id
       -- Les annonces d'un membre qui a quitté la guilde disparaissent
       JOIN guild_members gm ON gm.user_id = p.author_user_id AND gm.guild_id = p.guild_id
       ${characterLateral('ac', 'p.author_user_id', 'p.character_id', 'p.guild_id')}
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS active FROM help_pairs hp WHERE hp.post_id = p.id AND hp.ended_at IS NULL
       ) pc ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS pending FROM help_applications a WHERE a.post_id = p.id AND a.status = 'pending'
       ) ap ON TRUE
       LEFT JOIN help_applications mine ON mine.post_id = p.id AND mine.user_id = $2
       WHERE p.guild_id = $1 AND p.status = 'open' ${postId ? 'AND p.id = $3' : ''}
       ORDER BY p.created_at DESC
       LIMIT ${MAX_LISTED_POSTS}`,
      postId ? [guildId, userId, postId] : [guildId, userId],
    );
    return rows;
  }

  private static async listPendingApplicationsForAuthor(guildId: string, userId: string): Promise<HelpApplication[]> {
    const { rows } = await pool.query<HelpApplication>(
      `SELECT a.id, a.post_id, a.user_id, u.battletag, ch.name AS character_name, ch.class AS character_class,
              a.message, ${ISO('a.created_at')} AS created_at
       FROM help_applications a
       JOIN help_posts p ON p.id = a.post_id
       JOIN users u ON u.id = a.user_id
       JOIN guild_members gm ON gm.user_id = a.user_id AND gm.guild_id = a.guild_id
       ${characterLateral('ch', 'a.user_id', 'a.character_id', 'a.guild_id')}
       WHERE a.guild_id = $1 AND p.author_user_id = $2 AND p.status = 'open' AND a.status = 'pending'
       ORDER BY a.created_at ASC`,
      [guildId, userId],
    );
    return rows;
  }

  private static async listActivePairs(guildId: string, userId: string): Promise<HelpPair[]> {
    const { rows } = await pool.query<HelpPair>(
      `SELECT hp.id, hp.post_id, p.title AS post_title, hp.category, ${ISO('hp.started_at')} AS started_at,
              hp.helper_user_id, hu.battletag AS helper_battletag,
              hc.name AS helper_character_name, hc.class AS helper_character_class,
              hp.helped_user_id, du.battletag AS helped_battletag,
              dc.name AS helped_character_name, dc.class AS helped_character_class,
              CASE
                WHEN hp.helper_user_id = $2 THEN NULLIF(du.discord_id, '')
                WHEN hp.helped_user_id = $2 THEN NULLIF(hu.discord_id, '')
              END AS partner_discord_id
       FROM help_pairs hp
       LEFT JOIN help_posts p ON p.id = hp.post_id
       JOIN users hu ON hu.id = hp.helper_user_id
       JOIN users du ON du.id = hp.helped_user_id
       JOIN guild_members hgm ON hgm.user_id = hp.helper_user_id AND hgm.guild_id = hp.guild_id
       JOIN guild_members dgm ON dgm.user_id = hp.helped_user_id AND dgm.guild_id = hp.guild_id
       ${characterLateral('hc', 'hp.helper_user_id', 'hp.helper_character_id', 'hp.guild_id')}
       ${characterLateral('dc', 'hp.helped_user_id', 'hp.helped_character_id', 'hp.guild_id')}
       WHERE hp.guild_id = $1 AND hp.ended_at IS NULL
       -- Mes binômes d'abord, puis les plus récents
       ORDER BY (hp.helper_user_id = $2 OR hp.helped_user_id = $2) DESC, hp.started_at DESC
       LIMIT ${MAX_LISTED_PAIRS}`,
      [guildId, userId],
    );
    return rows;
  }

  static async getPost(guildId: string, userId: string, postId: string): Promise<HelpPost> {
    const [post] = await this.listPosts(guildId, userId, postId);
    if (!post) throw new HttpError(404, 'Help post not found', 'HELP_POST_NOT_FOUND');
    return post;
  }

  static async createPost(guildId: string, userId: string, input: CreateHelpPostInput): Promise<string> {
    return withTransaction(async (client) => {
      // Sérialise les créations d'un même membre pour que le quota ne soit pas contournable en parallèle
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`help:${guildId}:${userId}`]);
      const { rows } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM help_posts WHERE guild_id = $1 AND author_user_id = $2 AND status = 'open'`,
        [guildId, userId],
      );
      if (rows[0].count >= MAX_OPEN_POSTS_PER_USER) {
        throw new HttpError(409, 'Too many open help posts', 'HELP_QUOTA_REACHED');
      }
      await assertOwnCharacter(client, guildId, userId, input.characterId);

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO help_posts (guild_id, author_user_id, character_id, kind, category, target_role, title, description, capacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [guildId, userId, input.characterId, input.kind, input.category, input.targetRole, input.title, input.description, input.capacity],
      );
      return inserted.rows[0].id;
    });
  }

  static async updatePost(guildId: string, userId: string, postId: string, input: UpdateHelpPostInput): Promise<void> {
    await withTransaction(async (client) => {
      const post = await lockPost(client, guildId, postId);
      if (post.author_user_id !== userId) throw forbidden();
      if (post.status !== 'open') throw closedError();
      if (input.capacity < (await countActivePairs(client, postId))) {
        throw new HttpError(409, 'Capacity is below the number of active pairs', 'HELP_CAPACITY_BELOW_ACTIVE');
      }
      await assertOwnCharacter(client, guildId, userId, input.characterId);

      await client.query(
        `UPDATE help_posts
         SET character_id = $2, category = $3, target_role = $4, title = $5, description = $6, capacity = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [postId, input.characterId, input.category, input.targetRole, input.title, input.description, input.capacity],
      );
    });
  }

  /** Clôture par l'auteur ou un modérateur. Les binômes déjà formés continuent. */
  static async closePost(guildId: string, user: Express.User, postId: string): Promise<void> {
    await withTransaction(async (client) => {
      const post = await lockPost(client, guildId, postId);
      if (post.author_user_id !== user.id && !isGuildModerator(user)) throw forbidden();
      if (post.status !== 'open') return;

      await client.query(
        `UPDATE help_posts SET status = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [postId],
      );
      await client.query(
        `UPDATE help_applications SET status = 'declined', updated_at = CURRENT_TIMESTAMP
         WHERE post_id = $1 AND status = 'pending'`,
        [postId],
      );
    });
  }

  static async apply(guildId: string, userId: string, postId: string, input: ApplyHelpPostInput): Promise<string> {
    return withTransaction(async (client) => {
      // Verrou partagé avec accept() : la capacité est vérifiée sur un état stable
      const post = await lockPost(client, guildId, postId);
      if (post.status !== 'open') throw closedError();
      if (post.author_user_id === userId) {
        throw new HttpError(409, 'You cannot answer your own help post', 'HELP_OWN_POST');
      }
      if ((await countActivePairs(client, postId)) >= post.capacity) throw fullError();

      const { helperId, helpedId } = pairMembers(post, userId);
      if (await hasActivePair(client, guildId, helperId, helpedId)) throw pairExistsError();
      await assertOwnCharacter(client, guildId, userId, input.characterId);

      // Renouvelable après un retrait ou la fin d'un binôme ; une candidature refusée ne peut pas être renvoyée
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO help_applications (post_id, guild_id, user_id, character_id, message)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (post_id, user_id) DO UPDATE
           SET status = 'pending', character_id = EXCLUDED.character_id, message = EXCLUDED.message,
               created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE help_applications.status IN ('withdrawn', 'accepted')
         RETURNING id`,
        [postId, guildId, userId, input.characterId, input.message],
      );
      if (!rows[0]) throw new HttpError(409, 'You already answered this help post', 'HELP_ALREADY_APPLIED');
      return rows[0].id;
    });
  }

  static async withdraw(guildId: string, userId: string, postId: string): Promise<void> {
    const result = await pool.query(
      `UPDATE help_applications SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
       WHERE post_id = $1 AND guild_id = $2 AND user_id = $3 AND status = 'pending'`,
      [postId, guildId, userId],
    );
    if (!result.rowCount) throw new HttpError(404, 'No pending application on this help post', 'HELP_APPLICATION_NOT_FOUND');
  }

  /** Acceptation (crée le binôme) ou refus d'une candidature, par l'auteur de l'annonce. */
  static async decide(
    guildId: string,
    userId: string,
    applicationId: string,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    await withTransaction(async (client) => {
      const appRes = await client.query<{ post_id: string; user_id: string; character_id: string | null; status: string }>(
        `SELECT post_id, user_id, character_id, status FROM help_applications WHERE id = $1 AND guild_id = $2`,
        [applicationId, guildId],
      );
      const application = appRes.rows[0];
      if (!application) throw new HttpError(404, 'Application not found', 'HELP_APPLICATION_NOT_FOUND');

      const post = await lockPost(client, guildId, application.post_id);
      if (post.author_user_id !== userId) throw forbidden();

      // Relu après le verrou du post : une autre décision a pu passer entre-temps
      const current = await client.query<{ status: string }>(
        'SELECT status FROM help_applications WHERE id = $1 FOR UPDATE',
        [applicationId],
      );
      if (current.rows[0].status !== 'pending') {
        throw new HttpError(409, 'This application is no longer pending', 'HELP_APPLICATION_NOT_PENDING');
      }

      if (decision === 'accept') {
        if (post.status !== 'open') throw closedError();
        if ((await countActivePairs(client, post.id)) >= post.capacity) throw fullError();

        const { helperId, helpedId } = pairMembers(post, application.user_id);
        const applicantIsHelper = helperId === application.user_id;
        try {
          await client.query(
            `INSERT INTO help_pairs (guild_id, post_id, helper_user_id, helped_user_id, helper_character_id, helped_character_id, category)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              guildId,
              post.id,
              helperId,
              helpedId,
              applicantIsHelper ? application.character_id : post.character_id,
              applicantIsHelper ? post.character_id : application.character_id,
              post.category,
            ],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505') throw pairExistsError();
          throw error;
        }
      }

      await client.query(
        `UPDATE help_applications SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [applicationId, decision === 'accept' ? 'accepted' : 'declined'],
      );
    });
  }

  /** Fin d'un binôme par l'un de ses deux membres ou par un modérateur. */
  static async endPair(guildId: string, user: Express.User, pairId: string): Promise<void> {
    const result = await pool.query(
      `UPDATE help_pairs SET ended_at = CURRENT_TIMESTAMP, ended_by = $3
       WHERE id = $1 AND guild_id = $2 AND ended_at IS NULL
         AND ($4 OR helper_user_id = $3 OR helped_user_id = $3)`,
      [pairId, guildId, user.id, isGuildModerator(user)],
    );
    if (!result.rowCount) throw new HttpError(404, 'Active pair not found', 'HELP_PAIR_NOT_FOUND');
  }
}

/** Aidant et aidé selon le type d'annonce : sur une demande, c'est celui qui répond qui aide. */
function pairMembers(post: LockedPost, respondentId: string): { helperId: string; helpedId: string } {
  return post.kind === 'request'
    ? { helperId: respondentId, helpedId: post.author_user_id }
    : { helperId: post.author_user_id, helpedId: respondentId };
}

async function lockPost(client: PoolClient, guildId: string, postId: string): Promise<LockedPost> {
  const { rows } = await client.query<LockedPost>(
    `SELECT id, author_user_id, kind, category, character_id, capacity, status
     FROM help_posts WHERE id = $1 AND guild_id = $2 FOR UPDATE`,
    [postId, guildId],
  );
  // 404 aussi pour une annonce d'une autre guilde : on ne révèle pas son existence
  if (!rows[0]) throw new HttpError(404, 'Help post not found', 'HELP_POST_NOT_FOUND');
  return rows[0];
}

async function countActivePairs(client: PoolClient, postId: string): Promise<number> {
  const { rows } = await client.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM help_pairs WHERE post_id = $1 AND ended_at IS NULL',
    [postId],
  );
  return rows[0].count;
}

async function hasActivePair(client: PoolClient, guildId: string, helperId: string, helpedId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM help_pairs
     WHERE guild_id = $1 AND helper_user_id = $2 AND helped_user_id = $3 AND ended_at IS NULL`,
    [guildId, helperId, helpedId],
  );
  return !!rowCount;
}

async function assertOwnCharacter(client: PoolClient, guildId: string, userId: string, characterId: string | null) {
  if (!characterId) return;
  const { rowCount } = await client.query(
    'SELECT 1 FROM characters WHERE id = $1 AND user_id = $2 AND guild_id = $3',
    [characterId, userId, guildId],
  );
  if (!rowCount) throw new HttpError(400, 'Character not found in this guild', 'HELP_INVALID_CHARACTER');
}

const forbidden = () => new HttpError(403, 'Not allowed on this help post', 'HELP_FORBIDDEN');
const closedError = () => new HttpError(409, 'This help post is closed', 'HELP_POST_CLOSED');
const fullError = () => new HttpError(409, 'This help post is full', 'HELP_POST_FULL');
const pairExistsError = () => new HttpError(409, 'You already form an active pair', 'HELP_PAIR_EXISTS');
