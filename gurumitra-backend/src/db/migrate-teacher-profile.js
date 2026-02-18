import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema-teacher-profile.sql');

async function migrate() {
  try {
    const sql = readFileSync(schemaPath, 'utf8');
    await query(sql);
    console.log('Teacher profile migration completed: subjects, classes columns.');
  } catch (err) {
    console.error('Teacher profile migration failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
