import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema-video-analysis.sql');

async function migrate() {
  try {
    const sql = readFileSync(schemaPath, 'utf8');
    await query(sql);
    console.log('Video analysis migration completed: academic_plan_id, chapter_index, teacher_chapter_progress.');
  } catch (err) {
    console.error('Video analysis migration failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
