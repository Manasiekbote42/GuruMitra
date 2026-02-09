-- GuruMitra PostgreSQL Schema (Neon)
-- Run via: npm run db:migrate (or execute this file in Neon SQL Editor)

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('teacher', 'management', 'admin')),
  department VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

-- 2. classroom_sessions (one row per upload; analysis_status = status)
CREATE TABLE IF NOT EXISTS classroom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- status = analysis_status: pending | processing | completed | failed. Feedback/scores keyed by session id.

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_teacher ON classroom_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_status ON classroom_sessions(status);

-- 3. feedback
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  strengths TEXT,
  improvements TEXT,
  recommendations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_session ON feedback(session_id);

-- 4. scores
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  clarity_score DECIMAL(3,2) CHECK (clarity_score >= 0 AND clarity_score <= 5),
  engagement_score DECIMAL(3,2) CHECK (engagement_score >= 0 AND engagement_score <= 5),
  interaction_score DECIMAL(3,2) CHECK (interaction_score >= 0 AND interaction_score <= 5),
  overall_score DECIMAL(3,2) CHECK (overall_score >= 0 AND overall_score <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_session ON scores(session_id);

-- Optional: system_activity for Admin
CREATE TABLE IF NOT EXISTS system_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(255),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_activity_created ON system_activity(created_at);

-- Allow user delete: keep activity rows but set user_id to NULL when user is deleted
ALTER TABLE system_activity DROP CONSTRAINT IF EXISTS system_activity_user_id_fkey;
ALTER TABLE system_activity ADD CONSTRAINT system_activity_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Upload metadata for AI: optional duration (seconds), speech_ratio (0-1), audio_energy (0-1)
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS upload_metadata JSONB;

-- Content hash: same video/content always yields same hash; used to reuse AI feedback for duplicate uploads
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_content_hash ON classroom_sessions(content_hash) WHERE content_hash IS NOT NULL;

-- Reason when status = 'failed' (e.g. AI timeout, invalid URL, ffmpeg missing)
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Session-level storage: transcript and metrics from analyzer only (no fake data)
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS audio_metrics JSONB;
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS content_metrics JSONB;

-- Full analyzer output (single source); one upload = one session, never overwritten
-- analysis_result = { session_id, transcript_summary, scores: { pedagogy, engagement, delivery, curriculum }, strengths, improvements, recommendations, metrics: { audio, content } }
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS analysis_result JSONB;
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_created_at ON classroom_sessions(created_at DESC);

-- Password reset tokens (for forgot/reset flow); token stored hashed
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
