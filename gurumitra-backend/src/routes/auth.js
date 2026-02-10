import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { audit } from '../services/auditLog.js';

const router = express.Router();
const ROLES = ['teacher', 'management', 'admin'];
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Sign up: name, email, password, role. No plain passwords stored.
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role } = req.body;
    const trimmedName = (name || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedName) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!trimmedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Please select a role: Teacher, Management, or Admin' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [trimmedEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const defaultSchoolId = '00000000-0000-0000-0000-000000000001'; // Phase 5: assign default school for teacher/management
    const schoolId = role === 'admin' ? null : defaultSchoolId;
    await query(
      `INSERT INTO users (name, email, password_hash, role, school_id) VALUES ($1, $2, $3, $4, $5)`,
      [trimmedName, trimmedEmail, passwordHash, role, schoolId]
    );

    res.status(201).json({ message: 'Account created. You can sign in now.' });
  } catch (err) {
    console.error('Signup error:', err);
    // Duplicate email (unique constraint) or other DB error
    const code = err.code || err.constraint;
    if (code === '23505' || (err.message && err.message.includes('unique'))) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again or use a different email.' });
  }
});

// Login: email + password; role comes from DB
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, role, department, school_id FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Account not configured. Contact admin to set password.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      school_id: user.school_id || null,
    });

    audit(user.id, user.role, 'login', 'user', user.id, user.school_id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        school_id: user.school_id || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    const msg = process.env.NODE_ENV === 'development' ? (err.message || 'Login failed') : 'Login failed';
    res.status(500).json({ error: msg });
  }
});

// Get current user (protected)
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, department, school_id, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Forgot password: always return same message (do not reveal if email exists)
router.post('/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
      await query(
        'INSERT INTO password_reset_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)',
        [email, tokenHash, expiresAt]
      );
      // MVP: log reset link so dev can test (no email sent)
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      console.info('[forgot-password] Reset link:', `${baseUrl}/reset-password?token=${rawToken}`);
    }
    res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

// Reset password: token from link + new password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const tokenHash = hashToken(token);
    const row = await query(
      'SELECT email FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );
    if (row.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Request a new one.' });
    }
    const email = row.rows[0].email;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2', [passwordHash, email]);
    await query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);

    res.json({ message: 'Password updated. You can sign in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
