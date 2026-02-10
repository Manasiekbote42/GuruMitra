import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../services/auditLog.js';

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// Add user (optional school_id for teacher/management)
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, department, school_id } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email, and role are required' });
    }
    const allowedRoles = ['teacher', 'management', 'admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'role must be teacher, management, or admin' });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, department, school_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, school_id, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, role, department || null, school_id || null]
    );
    const user = result.rows[0];

    audit(req.user.id, 'admin', 'user_created', 'user', user.id, user.school_id);

    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (name, email, department, school_id; optional password)
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, department, school_id, password } = req.body;
    const updates = [];
    const values = [];
    let pos = 1;
    if (name != null && name.trim() !== '') {
      updates.push(`name = $${pos++}`);
      values.push(name.trim());
    }
    if (email != null && email.trim() !== '') {
      updates.push(`email = $${pos++}`);
      values.push(email.trim().toLowerCase());
    }
    if (department !== undefined) {
      updates.push(`department = $${pos++}`);
      values.push(department === '' ? null : department);
    }
    if (school_id !== undefined) {
      updates.push(`school_id = $${pos++}`);
      values.push(school_id === '' ? null : school_id);
    }
    if (password !== undefined && password !== '') {
      updates.push(`password_hash = $${pos++}`);
      values.push(await bcrypt.hash(password, 10));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Provide at least one field: name, email, department, school_id, or password' });
    }
    updates.push(`updated_at = NOW()`);
    values.push(userId);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${pos} RETURNING id, name, email, role, department, school_id, updated_at`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    audit(req.user.id, 'admin', 'user_updated', 'user', userId, null);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (cascades to sessions, feedback, scores, activity)
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const result = await query(
      `DELETE FROM users WHERE id = $1 RETURNING id, email`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    audit(req.user.id, 'admin', 'user_deleted', 'user', userId, null);
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Assign/update role
router.patch('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const allowedRoles = ['teacher', 'management', 'admin'];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'role must be teacher, management, or admin' });
    }

    const result = await query(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, name, email, role, department`,
      [role, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    audit(req.user.id, 'admin', 'role_updated', 'user', userId, null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// List users (optional: filter by role). Returns school_id for assignment.
router.get('/users', async (req, res) => {
  try {
    const { role } = req.query;
    let result;
    if (role) {
      result = await query(
        `SELECT id, name, email, role, department, school_id, created_at FROM users WHERE role = $1 ORDER BY name`,
        [role]
      );
    } else {
      result = await query(
        `SELECT id, name, email, role, department, school_id, created_at FROM users ORDER BY name`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Phase 5: List schools (for assigning users to schools)
router.get('/schools', async (req, res) => {
  try {
    const result = await query('SELECT id, name, created_at FROM schools ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// Phase 5: Audit logs (admin only). Mandatory for production compliance.
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const action = (req.query.action || '').trim() || null;
    const result = await query(
      `SELECT a.id, a.user_id, a.role, a.action, a.entity_type, a.entity_id, a.school_id, a.created_at,
              u.email AS actor_email, u.name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${action ? 'WHERE a.action = $3' : ''}
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      action ? [limit, offset, action] : [limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// View system activity
router.get('/activity', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await query(
      `SELECT a.id, a.user_id, a.action, a.details, a.created_at, u.email AS actor_email
       FROM system_activity a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [Math.min(Number(limit) || 50, 100)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// System status: total uploads, processing/completed/failed counts, analyzer health (last run), recent uploads. From session data only.
router.get('/system/status', async (req, res) => {
  try {
    const [countsResult, lastRunResult, recentResult] = await Promise.all([
      query(
        `SELECT
          COUNT(*) AS total_uploads,
          COUNT(*) FILTER (WHERE status = 'processing' OR status = 'pending') AS processing,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed
         FROM classroom_sessions`
      ),
      query(
        `SELECT created_at FROM system_activity WHERE action = 'session_processed' ORDER BY created_at DESC LIMIT 1`
      ),
      query(
        `SELECT s.id, s.teacher_id, s.video_url, s.status, s.error_message, s.created_at, u.name AS teacher_name
         FROM classroom_sessions s
         LEFT JOIN users u ON u.id = s.teacher_id
         ORDER BY s.created_at DESC
         LIMIT 30`
      ),
    ]);
    const counts = countsResult.rows[0];
    const lastRun = lastRunResult.rows[0]?.created_at || null;
    res.json({
      total_uploads: parseInt(counts.total_uploads, 10) || 0,
      sessions_processing: parseInt(counts.processing, 10) || 0,
      sessions_completed: parseInt(counts.completed, 10) || 0,
      sessions_failed: parseInt(counts.failed, 10) || 0,
      analyzer_last_run_at: lastRun,
      recent_uploads: recentResult.rows.map((r) => ({
        session_id: r.id,
        teacher_id: r.teacher_id,
        teacher_name: r.teacher_name,
        status: r.status,
        error_message: r.error_message || null,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

export default router;
