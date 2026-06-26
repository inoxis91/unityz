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
        blizzard_id INTEGER UNIQUE,
        name VARCHAR(255) NOT NULL,
        realm VARCHAR(255) NOT NULL,
        region VARCHAR(50) DEFAULT 'eu',
        subscription_tier VARCHAR(50) DEFAULT 'none',
        subscription_expires_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        subscription_status VARCHAR(50),
        discord_enabled BOOLEAN DEFAULT FALSE,
        discord_guild_id VARCHAR(255),
        discord_events_channel_id VARCHAR(255),
        discord_fees_channel_id VARCHAR(255),
        discord_reminder_channel_id VARCHAR(255),
        discord_locale VARCHAR(50) DEFAULT 'en',
        fees_enabled BOOLEAN DEFAULT TRUE,
        minimum_fee_amount INTEGER DEFAULT 2000,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
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

    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

export default pool;
