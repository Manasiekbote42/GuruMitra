import pg from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const DB_ENABLED = DATABASE_URL.length > 0;

if (!DB_ENABLED) {
  // Don't crash the whole API in local/dev environments; allow the server to start
  // so non-DB features (and health endpoints) can still run.
  console.warn(
    'DATABASE_URL is not set. DB-backed routes will fail until you add it to gurumitra-backend/.env (copy from .env.example).'
  );
}

// Prefer IPv4 for DNS (can fix ENOTFOUND for Neon on some networks)
dns.setDefaultResultOrder('ipv4first');

const { Pool } = pg;

const pool = DB_ENABLED
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

pool?.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

/**
 * Reusable query helper
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params = []) {
  if (!DB_ENABLED || !pool) {
    const err = new Error('Database is not configured. Set DATABASE_URL in gurumitra-backend/.env');
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.debug('Query executed', { duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Database query error:', { text: text?.slice(0, 80), err: err.message });
    throw err;
  }
}

/**
 * Test connection (for health check)
 */
export async function testConnection() {
  if (!DB_ENABLED || !pool) return false;
  try {
    const res = await pool.query('SELECT 1 as ok');
    return res.rows[0]?.ok === 1;
  } catch (err) {
    console.error('Database connection test failed:', err.message);
    return false;
  }
}

export { pool };
export default pool;
