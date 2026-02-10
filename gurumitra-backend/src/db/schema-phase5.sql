-- Phase 5: Schools, RBAC, audit, session immutability
-- Run after main schema. Execute in Neon SQL Editor or: node src/db/migrate-phase5.js

-- 1. Schools (organizations)
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schools_name ON schools(name);

-- Insert default school for existing data
INSERT INTO schools (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default School')
ON CONFLICT (id) DO NOTHING;

-- 2. Users: add school_id (teachers and management belong to one school; admin can be null for "all schools")
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
-- Backfill: assign existing users to default school
UPDATE users SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;

-- 3. Classroom sessions: add school_id (denormalized from teacher for fast filtering), analyzed_at, is_locked
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_school ON classroom_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_locked ON classroom_sessions(is_locked) WHERE is_locked = TRUE;
-- Backfill session school_id from teacher
UPDATE classroom_sessions cs SET school_id = u.school_id FROM users u WHERE u.id = cs.teacher_id AND cs.school_id IS NULL;

-- 4. Audit logs (mandatory for production)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
