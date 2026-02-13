-- Training Library: admin-managed, read-only for teachers and management
-- Run after phase5. Execute in Neon SQL Editor or: node src/db/migrate-training-library.js

CREATE TABLE IF NOT EXISTS training_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  category VARCHAR(255) NOT NULL,
  sub_category VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('pdf', 'text')),
  content_url TEXT,
  content_text TEXT,
  description TEXT,
  visible_to VARCHAR(50) NOT NULL DEFAULT 'both' CHECK (visible_to IN ('teacher', 'management', 'both')),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_library_category ON training_library(category);
CREATE INDEX IF NOT EXISTS idx_training_library_sub_category ON training_library(sub_category);
CREATE INDEX IF NOT EXISTS idx_training_library_visible_to ON training_library(visible_to);
CREATE INDEX IF NOT EXISTS idx_training_library_school ON training_library(school_id);
CREATE INDEX IF NOT EXISTS idx_training_library_created ON training_library(created_at DESC);
