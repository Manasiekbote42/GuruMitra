import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Verify JWT and attach user to req.user
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, role: decoded.role, school_id: decoded.school_id || null };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require one of the given roles
 * @param {string[]} allowedRoles - e.g. ['teacher', 'management', 'admin']
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Phase 5: Management can only access their school. Admin has full access.
 * Call after requireRole('management', 'admin'). Ensures management has school_id.
 */
export function requireSchoolForManagement(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.role === 'management' && (req.user.school_id == null || req.user.school_id === '')) {
    return res.status(403).json({ error: 'No school assigned. Contact admin.' });
  }
  next();
}

/**
 * Generate JWT for a user (use after login)
 */
export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, school_id: user.school_id || null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export { JWT_SECRET };
