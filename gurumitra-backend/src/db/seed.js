import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';

const DEMO_PASSWORD = 'demo123';

async function seed() {
  try {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

    await query(`
      INSERT INTO users (name, email, password_hash, role, department)
      VALUES
        ('Teacher Demo', 'teacher@gurumitra.demo', $1, 'teacher', 'Mathematics'),
        ('Management Demo', 'management@gurumitra.demo', $1, 'management', null),
        ('Admin Demo', 'admin@gurumitra.demo', $1, 'admin', null)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        department = EXCLUDED.department,
        updated_at = NOW()
    `, [hash]);

    console.log('Seed completed. Demo users (password: ' + DEMO_PASSWORD + '):');
    console.log('  teacher@gurumitra.demo (Teacher)');
    console.log('  management@gurumitra.demo (Management)');
    console.log('  admin@gurumitra.demo (Admin)');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

seed();
