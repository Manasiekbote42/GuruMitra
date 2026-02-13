import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../services/auditLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(path.dirname(__dirname), '..', 'uploads');
const TRAINING_DIR = path.join(UPLOADS_DIR, 'training');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(TRAINING_DIR)) fs.mkdirSync(TRAINING_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TRAINING_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname) || '.pdf'}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.pdf$/i.test(file.originalname) || (file.mimetype === 'application/pdf');
    cb(null, !!ok);
  },
});

const router = express.Router();
router.use(authenticate, requireRole('admin'));

/**
 * GET /api/admin/training-library - List all items (admin).
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT t.id, t.title, t.category, t.sub_category, t.content_type, t.content_url, t.content_text, t.description, t.visible_to, t.school_id, t.uploaded_by, t.created_at,
              u.name AS uploaded_by_name
       FROM training_library t
       LEFT JOIN users u ON u.id = t.uploaded_by
       ORDER BY t.category, t.sub_category, t.title`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch training library' });
  }
});

/**
 * POST /api/admin/training-library - Create item. Body: title, category, sub_category, content_type (pdf|text), description, visible_to.
 * If content_type=pdf: send file as multipart field "file". If content_type=text: send content_text in body.
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, category, sub_category, content_type, description, visible_to } = req.body;
    if (!title || !category || !sub_category || !content_type) {
      return res.status(400).json({ error: 'title, category, sub_category, and content_type are required' });
    }
    if (!['pdf', 'text'].includes(content_type)) {
      return res.status(400).json({ error: 'content_type must be pdf or text' });
    }
    const visibleTo = ['teacher', 'management', 'both'].includes(visible_to) ? visible_to : 'both';

    let contentUrl = null;
    let contentText = null;

    if (content_type === 'pdf') {
      if (!req.file || !req.file.filename) {
        return res.status(400).json({ error: 'PDF file is required for content_type pdf' });
      }
      contentUrl = 'training/' + req.file.filename;
    } else {
      contentText = req.body.content_text != null ? String(req.body.content_text) : null;
    }

    const result = await query(
      `INSERT INTO training_library (title, category, sub_category, content_type, content_url, content_text, description, visible_to, uploaded_by, school_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, title, category, sub_category, content_type, content_url, content_text, description, visible_to, uploaded_by, created_at`,
      [
        title.trim(),
        category.trim(),
        sub_category.trim(),
        content_type,
        contentUrl,
        contentText,
        description != null ? String(description).trim() : null,
        visibleTo,
        req.user.id,
        req.user.school_id || null,
      ]
    );
    const row = result.rows[0];
    audit(req.user.id, 'admin', 'training_library_created', 'training_library', row.id, req.user.school_id);
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create training library item' });
  }
});

/**
 * PUT /api/admin/training-library/:id - Update item. Optional: title, category, sub_category, content_type, description, visible_to, content_text.
 * To replace PDF: send multipart file (field "file").
 */
router.put('/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, sub_category, content_type, description, visible_to, content_text } = req.body;

    const existing = await query(
      'SELECT id, content_type, content_url FROM training_library WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const current = existing.rows[0];

    const updates = [];
    const values = [];
    let pos = 1;

    if (title != null && String(title).trim()) {
      updates.push(`title = $${pos++}`);
      values.push(title.trim());
    }
    if (category != null && String(category).trim()) {
      updates.push(`category = $${pos++}`);
      values.push(category.trim());
    }
    if (sub_category != null && String(sub_category).trim()) {
      updates.push(`sub_category = $${pos++}`);
      values.push(sub_category.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${pos++}`);
      values.push(description == null ? null : String(description).trim());
    }
    if (visible_to !== undefined && ['teacher', 'management', 'both'].includes(visible_to)) {
      updates.push(`visible_to = $${pos++}`);
      values.push(visible_to);
    }
    if (content_type !== undefined && ['pdf', 'text'].includes(content_type)) {
      updates.push(`content_type = $${pos++}`);
      values.push(content_type);
    }
    if (content_text !== undefined) {
      updates.push(`content_text = $${pos++}`);
      values.push(content_text == null ? null : String(content_text));
    }

    if (req.file && req.file.filename) {
      if (current.content_url) {
        const oldPath = path.join(UPLOADS_DIR, current.content_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updates.push(`content_url = $${pos++}`);
      values.push('training/' + req.file.filename);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    values.push(id);
    const result = await query(
      `UPDATE training_library SET ${updates.join(', ')} WHERE id = $${pos} RETURNING id, title, category, sub_category, content_type, content_url, content_text, description, visible_to, uploaded_by, created_at`,
      values
    );
    audit(req.user.id, 'admin', 'training_library_updated', 'training_library', id, req.user.school_id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update training library item' });
  }
});

/**
 * DELETE /api/admin/training-library/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query(
      'SELECT id, content_url FROM training_library WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const contentUrl = existing.rows[0].content_url;
    if (contentUrl) {
      const filePath = path.join(UPLOADS_DIR, contentUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await query('DELETE FROM training_library WHERE id = $1', [id]);
    audit(req.user.id, 'admin', 'training_library_deleted', 'training_library', id, req.user.school_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete training library item' });
  }
});

export default router;
