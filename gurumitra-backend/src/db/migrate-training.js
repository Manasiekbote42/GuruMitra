import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema-training.sql');

async function migrate() {
  try {
    const sql = readFileSync(schemaPath, 'utf8');
    await query(sql);
    console.log('Training modules migration completed.');
  } catch (err) {
    console.error('Training migration failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
