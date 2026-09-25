import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const initDb = async (retries = 5, delay = 3000): Promise<void> => {
  let client!: PoolClient;
  for (let i = 0; i < retries; i++) {
    try {
      client = await pool.connect();
      break;
    } catch (err) {
      console.error(`Database connection attempt ${i + 1}/${retries} failed:`, (err as Error).message);
      if (i === retries - 1) {
        console.error('All database connection attempts failed. Exiting...');
        throw err;
      }
      console.log(`Waiting ${delay / 1000}s before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  try {
    console.log('Initializing database tables...');
    
    // Guilds table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guilds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        blizzard_id INTEGER,
        name VARCHAR(255) NOT NULL,
        realm VARCHAR(255) NOT NULL,
        region VARCHAR(50) NOT NULL DEFAULT 'eu',
        subscription_tier VARCHAR(50) DEFAULT 'none',
        subscription_expires_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        subscription_status VARCHAR(50),
        free_trial_used_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
        discord_enabled BOOLEAN DEFAULT FALSE,
        discord_guild_id VARCHAR(255),
        discord_events_channel_id VARCHAR(255),
        discord_fees_channel_id VARCHAR(255),
        discord_reminder_channel_id VARCHAR(255),
        discord_locale VARCHAR(50) DEFAULT 'en',
        discord_help_channel_id VARCHAR(255),
        fees_enabled BOOLEAN DEFAULT TRUE,
        minimum_fee_amount INTEGER DEFAULT 2000,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (blizzard_id, region)
      );
    `);

    // Une guilde est identifiée par (blizzard_id, region) : les ids Blizzard se répètent entre l'EU et l'US
    await client.query(`
      DO $$
      BEGIN
        UPDATE guilds SET region = 'eu' WHERE region IS NULL;
        ALTER TABLE guilds ALTER COLUMN region SET NOT NULL;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guilds_blizzard_id_key') THEN
          ALTER TABLE guilds DROP CONSTRAINT guilds_blizzard_id_key;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guilds_blizzard_id_region_key') THEN
          ALTER TABLE guilds ADD CONSTRAINT guilds_blizzard_id_region_key UNIQUE (blizzard_id, region);
        END IF;
      END $$;
    `);

    // Ensure Discord and Subscription columns exist in guilds
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='subscription_tier') THEN
          ALTER TABLE guilds ADD COLUMN subscription_tier VARCHAR(50) DEFAULT 'none';
        ELSE
          ALTER TABLE guilds ALTER COLUMN subscription_tier SET DEFAULT 'none';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='subscription_expires_at') THEN
          ALTER TABLE guilds ADD COLUMN subscription_expires_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;
        ELSE
          ALTER TABLE guilds ALTER COLUMN subscription_expires_at SET DEFAULT NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='stripe_customer_id') THEN
          ALTER TABLE guilds ADD COLUMN stripe_customer_id VARCHAR(255);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='stripe_subscription_id') THEN
          ALTER TABLE guilds ADD COLUMN stripe_subscription_id VARCHAR(255);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='subscription_status') THEN
          ALTER TABLE guilds ADD COLUMN subscription_status VARCHAR(50);
        END IF;

        -- Essai gratuit unique par guilde : toute guilde ayant déjà eu une offre l'a consommé
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='free_trial_used_at') THEN
          ALTER TABLE guilds ADD COLUMN free_trial_used_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;
          UPDATE guilds SET free_trial_used_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
          WHERE subscription_tier IN ('free', 'medium', 'pro') OR stripe_subscription_id IS NOT NULL;
        END IF;

        -- Migrate existing is_paid data
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='is_paid') THEN
          UPDATE guilds SET subscription_tier = 'pro', subscription_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 years' WHERE is_paid = TRUE;
          ALTER TABLE guilds DROP COLUMN is_paid;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='fees_enabled') THEN
          ALTER TABLE guilds ADD COLUMN fees_enabled BOOLEAN DEFAULT TRUE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='minimum_fee_amount') THEN
          ALTER TABLE guilds ADD COLUMN minimum_fee_amount INTEGER DEFAULT 2000;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_enabled') THEN
          ALTER TABLE guilds ADD COLUMN discord_enabled BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_guild_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_guild_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_events_channel_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_events_channel_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_fees_channel_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_fees_channel_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_reminder_channel_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_reminder_channel_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_locale') THEN
          ALTER TABLE guilds ADD COLUMN discord_locale VARCHAR(50) DEFAULT 'en';
        END IF;
      END $$;
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        bnet_id INTEGER UNIQUE NOT NULL,
        battletag VARCHAR(255) NOT NULL,
        discord_id VARCHAR(255),
        access_token TEXT,
        role VARCHAR(50) DEFAULT 'member',
        rank INTEGER,
        active_guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
        birthday DATE,
        professions VARCHAR(100)[] DEFAULT '{}'::VARCHAR[],
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure birthday column exists (migration for existing tables)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='birthday') THEN
          ALTER TABLE users ADD COLUMN birthday DATE;
        END IF;
      END $$;
    `);

    // Ensure active_guild_id exists (migration for existing tables)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='active_guild_id') THEN
          ALTER TABLE users ADD COLUMN active_guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Ensure role column exists and migrate is_admin before dropping it
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
          ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'member';
          
          -- Migrate existing admins IF the column is_admin still exists
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_admin') THEN
            UPDATE users SET role = 'admin' WHERE is_admin = TRUE;
          END IF;
        END IF;

        -- Drop the obsolete is_admin column
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_admin') THEN
          ALTER TABLE users DROP COLUMN is_admin;
        END IF;
      END $$;
    `);

    // Ensure discord_id exists (migration for existing tables)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='discord_id') THEN
          ALTER TABLE users ADD COLUMN discord_id VARCHAR(255);
        END IF;
      END $$;
    `);

    // Ensure professions exists (migration for existing tables)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='professions') THEN
          ALTER TABLE users ADD COLUMN professions VARCHAR(100)[] DEFAULT '{}'::VARCHAR[];
        END IF;
      END $$;
    `);

    // Characters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        realm VARCHAR(255) NOT NULL,
        class VARCHAR(255),
        level INTEGER,
        is_tank BOOLEAN DEFAULT FALSE,
        is_heal BOOLEAN DEFAULT FALSE,
        is_dps BOOLEAN DEFAULT FALSE,
        is_main BOOLEAN DEFAULT FALSE,
        roster_role VARCHAR(10) CHECK (roster_role IN ('tank', 'heal', 'dps')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, realm, user_id)
      );
    `);

    // Ensure is_main and guild_id columns exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='is_main') THEN
          ALTER TABLE characters ADD COLUMN is_main BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='guild_id') THEN
          ALTER TABLE characters ADD COLUMN guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Fee declarations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_declarations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        start_month DATE NOT NULL,
        duration_months INTEGER NOT NULL DEFAULT 1,
        comment TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        admin_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure guild_id exists in fee_declarations
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_declarations' AND column_name='guild_id') THEN
          ALTER TABLE fee_declarations ADD COLUMN guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Fee allocations table (final validated ledger)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
        month_date DATE NOT NULL,
        amount INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, month_date, guild_id)
      );
    `);

    // Ensure guild_id exists in fee_allocations and update UNIQUE constraint
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_allocations' AND column_name='guild_id') THEN
          ALTER TABLE fee_allocations ADD COLUMN guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_allocations_user_id_month_date_key') THEN
          ALTER TABLE fee_allocations DROP CONSTRAINT fee_allocations_user_id_month_date_key;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_allocations_user_id_month_date_guild_id_key') THEN
          ALTER TABLE fee_allocations ADD CONSTRAINT fee_allocations_user_id_month_date_guild_id_key UNIQUE(user_id, month_date, guild_id);
        END IF;
      END $$;
    `);

    // Rosters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rosters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        weight INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure weight and guild_id columns exist in rosters
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rosters' AND column_name='weight') THEN
          ALTER TABLE rosters ADD COLUMN weight INTEGER DEFAULT 1;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rosters' AND column_name='guild_id') THEN
          ALTER TABLE rosters ADD COLUMN guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Ensure roster_id column exists in characters
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='roster_id') THEN
          ALTER TABLE characters ADD COLUMN roster_id UUID REFERENCES rosters(id) ON DELETE SET NULL;
        END IF;
        -- Rôle tenu par le personnage dans son roster (catégorisation tank/heal/dps)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='roster_role') THEN
          ALTER TABLE characters ADD COLUMN roster_role VARCHAR(10) CHECK (roster_role IN ('tank', 'heal', 'dps'));
          UPDATE characters
          SET roster_role = CASE WHEN is_tank THEN 'tank' WHEN is_heal THEN 'heal' ELSE 'dps' END
          WHERE roster_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        type VARCHAR(50) NOT NULL, -- 'raid', 'other'
        roster_id UUID REFERENCES rosters(id) ON DELETE SET NULL,
        mm_groups_count INTEGER DEFAULT 0,
        is_canceled BOOLEAN DEFAULT FALSE,
        canceled_reason TEXT,
        registrations_locked BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(255) REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure roster_id and guild_id columns exist in events
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='roster_id') THEN
          ALTER TABLE events ADD COLUMN roster_id UUID REFERENCES rosters(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='mm_groups_count') THEN
          ALTER TABLE events ADD COLUMN mm_groups_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='guild_id') THEN
          ALTER TABLE events ADD COLUMN guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='is_canceled') THEN
          ALTER TABLE events ADD COLUMN is_canceled BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='canceled_reason') THEN
          ALTER TABLE events ADD COLUMN canceled_reason TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='logs') THEN
          ALTER TABLE events ADD COLUMN logs TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='registrations_locked') THEN
          ALTER TABLE events ADD COLUMN registrations_locked BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Event signups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_signups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES events(id) ON DELETE CASCADE,
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
        role VARCHAR(50), -- 'tank', 'heal', 'dps'
        status VARCHAR(50) DEFAULT 'signed_up', -- 'signed_up', 'confirmed', 'standby', 'declined'
        group_index INTEGER DEFAULT 0,
        comment TEXT,
        selection VARCHAR(10) CHECK (selection IN ('selected', 'benched')), -- NULL = en attente de décision du raid lead
        assigned_role VARCHAR(10) CHECK (assigned_role IN ('tank', 'heal', 'dps')), -- NULL = rôle choisi par le joueur
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, user_id) -- One character per user per event
      );
    `);

    // Craft Requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS craft_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        slot VARCHAR(100) NOT NULL,
        armor_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure comment column exists
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_signups' AND column_name='comment') THEN
          ALTER TABLE event_signups ADD COLUMN comment TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_signups' AND column_name='group_index') THEN
          ALTER TABLE event_signups ADD COLUMN group_index INTEGER DEFAULT 0;
        END IF;
        -- Line-up raid : sélection (validé / banc) et rôle imposé par le raid lead
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_signups' AND column_name='selection') THEN
          ALTER TABLE event_signups ADD COLUMN selection VARCHAR(10) CHECK (selection IN ('selected', 'benched'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_signups' AND column_name='assigned_role') THEN
          ALTER TABLE event_signups ADD COLUMN assigned_role VARCHAR(10) CHECK (assigned_role IN ('tank', 'heal', 'dps'));
        END IF;
      END $$;
    `);

    // Ensure invited_groups column exists in events table
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='invited_groups') THEN
          ALTER TABLE events ADD COLUMN invited_groups VARCHAR(50)[] DEFAULT '{}'::VARCHAR[];
        END IF;
      END $$;
    `);

    // Ensure discord_officer_channel_id column exists in guilds table
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_officer_channel_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_officer_channel_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_crafts_channel_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_crafts_channel_id VARCHAR(255);
        END IF;
      END $$;
    `);

    // Ensure discord_message_id column exists in craft_requests table
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='craft_requests' AND column_name='discord_message_id') THEN
          ALTER TABLE craft_requests ADD COLUMN discord_message_id VARCHAR(255);
        END IF;
      END $$;
    `);

    // Absences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS absences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE,
        reason TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure end_date can be NULL in absences table (for indefinite absences)
    await client.query(`
      ALTER TABLE absences ALTER COLUMN end_date DROP NOT NULL;
    `);

    // Rôle applicatif et rang en jeu par guilde (users.role / users.rank ne sont plus lus :
    // un joueur peut être admin d'une guilde et simple membre d'une autre).
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guild_members') THEN
          CREATE TABLE guild_members (
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL DEFAULT 'member'
              CHECK (role IN ('admin', 'raid_leader', 'treasurer', 'event_manager', 'member')),
            rank INTEGER,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, guild_id)
          );
          CREATE INDEX idx_guild_members_guild ON guild_members (guild_id);

          -- Reprise unique de l'existant : l'ancien rôle global s'applique à la guilde active,
          -- les autres guildes où le joueur a des personnages démarrent en simple membre.
          INSERT INTO guild_members (user_id, guild_id, role, rank)
          SELECT id, active_guild_id,
                 CASE WHEN role IN ('admin', 'raid_leader', 'treasurer', 'event_manager') THEN role ELSE 'member' END,
                 rank
          FROM users
          WHERE active_guild_id IS NOT NULL
          ON CONFLICT DO NOTHING;

          INSERT INTO guild_members (user_id, guild_id)
          SELECT DISTINCT user_id, guild_id FROM characters
          WHERE user_id IS NOT NULL AND guild_id IS NOT NULL
          ON CONFLICT DO NOTHING;
        END IF;
      END $$;
    `);

    // Entraide : annonces (demande / offre d'aide), candidatures, et binômes aidant ↔ aidé.
    // Un binôme vit indépendamment de son annonce : il dure jusqu'à ce que l'un des deux y mette fin.
    await client.query(`
      CREATE TABLE IF NOT EXISTS help_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        author_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
        kind VARCHAR(10) NOT NULL CHECK (kind IN ('request', 'offer')),
        category VARCHAR(20) NOT NULL,
        target_role VARCHAR(10) CHECK (target_role IN ('tank', 'heal', 'dps')),
        title VARCHAR(120) NOT NULL,
        description VARCHAR(1000) NOT NULL DEFAULT '',
        -- Nombre maximal de binômes actifs issus de l'annonce
        capacity SMALLINT NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 10),
        status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        closed_at TIMESTAMP WITHOUT TIME ZONE,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_help_posts_guild_open ON help_posts (guild_id, created_at DESC) WHERE status = 'open';
      CREATE INDEX IF NOT EXISTS idx_help_posts_author_open ON help_posts (guild_id, author_user_id) WHERE status = 'open';

      CREATE TABLE IF NOT EXISTS help_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES help_posts(id) ON DELETE CASCADE,
        guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
        message VARCHAR(300) NOT NULL DEFAULT '',
        status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_help_applications_guild_user ON help_applications (guild_id, user_id);

      CREATE TABLE IF NOT EXISTS help_pairs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        post_id UUID REFERENCES help_posts(id) ON DELETE SET NULL,
        helper_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        helped_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        helper_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
        helped_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
        category VARCHAR(20) NOT NULL,
        started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP WITHOUT TIME ZONE,
        ended_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        CHECK (helper_user_id <> helped_user_id)
      );
      -- Un seul binôme actif par couple aidant / aidé dans une guilde
      CREATE UNIQUE INDEX IF NOT EXISTS uq_help_pairs_active
        ON help_pairs (guild_id, helper_user_id, helped_user_id) WHERE ended_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_help_pairs_post_active ON help_pairs (post_id) WHERE ended_at IS NULL;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='discord_help_channel_id') THEN
          ALTER TABLE guilds ADD COLUMN discord_help_channel_id VARCHAR(255);
        END IF;
      END $$;
    `);

    // Sessions Express (connect-pg-simple) : survivent aux redéploiements, contrairement au MemoryStore
    await client.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
    `);

    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

/** Exécute `work` dans une transaction (COMMIT si succès, ROLLBACK sinon). */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
