import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const initDb = async () => {
  const client = await pool.connect();
  try {
    console.log('Initializing database tables...');
    
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        bnet_id INTEGER UNIQUE NOT NULL,
        battletag VARCHAR(255) NOT NULL,
        discord_id VARCHAR(255),
        access_token TEXT,
        is_admin BOOLEAN DEFAULT FALSE,
        rank INTEGER,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
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


    // Ensure is_admin column exists
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_admin') THEN
          ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Characters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
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

    // Ensure is_main column exists
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='is_main') THEN
          ALTER TABLE characters ADD COLUMN is_main BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Fee declarations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_declarations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
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

    // Fee allocations table (final validated ledger)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        month_date DATE NOT NULL,
        amount INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, month_date)
      );
    `);

    // Rosters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rosters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
        title VARCHAR(255) NOT NULL,
        description TEXT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        type VARCHAR(50) NOT NULL, -- 'raid', 'other'
        created_by VARCHAR(255) REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, user_id) -- One character per user per event
      );
    `);

    // Ensure comment column exists
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_signups' AND column_name='comment') THEN
          ALTER TABLE event_signups ADD COLUMN comment TEXT;
        END IF;
      END $$;
    `);

    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

export default pool;
