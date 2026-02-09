import pg from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

// Prefer IPv4 for DNS (can fix ENOTFOUND for Neon on some networks)
dns.setDefaultResultOrder('ipv4first');

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

/**
 * Reusable query helper
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params = []) {
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
