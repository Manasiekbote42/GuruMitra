/**
 * Phase 5: Audit logging. All actions logged for production compliance.
 * Do not rely on frontend; call from backend only.
 */
import { query } from '../config/db.js';

const DEFAULT_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Log an action. Fire-and-forget; never throw to caller.
 * @param {object} opts - { userId?, role, action, entityType?, entityId?, schoolId? }
 */
export async function logAudit(opts) {
  const { userId = null, role, action, entityType = null, entityId = null, schoolId = null } = opts || {};
  if (!role || !action) return;
  try {
    await query(
      `INSERT INTO audit_logs (user_id, role, action, entity_type, entity_id, school_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, String(role).slice(0, 50), String(action).slice(0, 100), entityType ? String(entityType).slice(0, 50) : null, entityId ? String(entityId).slice(0, 100) : null, schoolId || null]
    );
  } catch (err) {
    console.error('[audit_log]', err.message);
  }
}

/** Fire-and-forget helper so routes don't await */
export function audit(userId, role, action, entityType, entityId, schoolId) {
  logAudit({ userId, role, action, entityType, entityId, schoolId }).catch(() => {});
}
