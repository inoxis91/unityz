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
        access_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, realm, user_id)
      );
    `);

    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

export default pool;
