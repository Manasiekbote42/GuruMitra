import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(path.dirname(__dirname), '..', 'uploads');
const TRAINING_DIR = path.join(UPLOADS_DIR, 'training');

const router = express.Router();

/**
 * GET /api/training-library - List items visible to teacher or management (read-only).
 * Query: category, sub_category, search (title/description)
 */
router.get('/', authenticate, requireRole('teacher', 'management'), async (req, res) => {
  try {
    const { category, sub_category, search } = req.query;
    const role = req.user.role;
    const visibleFilter = role === 'teacher' ? ['teacher', 'both'] : ['management', 'both'];

    let sql = `
      SELECT id, title, category, sub_category, content_type, content_url, content_text, description, visible_to, created_at
      FROM training_library
      WHERE visible_to = ANY($1)
    `;
    const params = [visibleFilter];
    let pos = 2;

    if (category && String(category).trim()) {
      sql += ` AND category = $${pos++}`;
      params.push(String(category).trim());
    }
    if (sub_category && String(sub_category).trim()) {
      sql += ` AND sub_category = $${pos++}`;
      params.push(String(sub_category).trim());
    }
    if (search && String(search).trim()) {
      sql += ` AND (title ILIKE $${pos} OR description ILIKE $${pos})`;
      params.push(`%${String(search).trim()}%`);
      pos++;
    }

    sql += ` ORDER BY category, sub_category, title`;

    const result = await query(sql, params);
    const rows = result.rows.map((r) => ({
      ...r,
      content_view_url: r.content_type === 'pdf' && r.content_url ? `/api/training-library/file/${r.id}` : null,
    }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch training library' });
  }
});

/**
 * GET /api/training-library/categories - Distinct categories and subcategories for filters (read-only).
 */
router.get('/categories', authenticate, requireRole('teacher', 'management'), async (req, res) => {
  try {
    const role = req.user.role;
    const visibleFilter = role === 'teacher' ? ['teacher', 'both'] : ['management', 'both'];
    const result = await query(
      `SELECT DISTINCT category, sub_category FROM training_library WHERE visible_to = ANY($1) ORDER BY category, sub_category`,
      [visibleFilter]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/training-library/file/:id - Serve PDF file. Visibility check by role; admin can open any.
 */
router.get('/file/:id', authenticate, requireRole('teacher', 'management', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const visibleFilter = role === 'admin' ? null : role === 'teacher' ? ['teacher', 'both'] : ['management', 'both'];

    const row = await query(
      role === 'admin'
        ? `SELECT id, content_type, content_url FROM training_library WHERE id = $1`
        : `SELECT id, content_type, content_url FROM training_library WHERE id = $1 AND visible_to = ANY($2)`,
      role === 'admin' ? [id] : [id, visibleFilter]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const item = row.rows[0];
    if (item.content_type !== 'pdf' || !item.content_url) {
      return res.status(400).json({ error: 'No file for this item' });
    }
    const filePath = path.join(UPLOADS_DIR, item.content_url);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

export default router;
