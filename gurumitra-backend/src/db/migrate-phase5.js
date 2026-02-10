import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema-phase5.sql');

async function migrate() {
  try {
    const sql = readFileSync(schemaPath, 'utf8');
    await query(sql);
    console.log('Phase 5 migration completed: schools, school_id, audit_logs, session lock.');
  } catch (err) {
    console.error('Phase 5 migration failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
