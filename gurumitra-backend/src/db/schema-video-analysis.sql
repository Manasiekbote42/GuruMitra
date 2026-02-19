-- Video Analysis: link sessions to academic plan + chapter; track chapter completion per teacher.
-- Run after main schema. Execute in Neon SQL Editor or: node src/db/migrate-video-analysis.js

-- Optional: which academic plan and chapter this session belongs to (for Video Analysis tab)
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS academic_plan_id VARCHAR(255);
ALTER TABLE classroom_sessions ADD COLUMN IF NOT EXISTS chapter_index INT;

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_plan_chapter
  ON classroom_sessions(teacher_id, academic_plan_id, chapter_index)
  WHERE academic_plan_id IS NOT NULL;

-- Teacher marks a chapter as completed for a given plan
CREATE TABLE IF NOT EXISTS teacher_chapter_progress (
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(255) NOT NULL,
  chapter_index INT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (teacher_id, plan_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS idx_teacher_chapter_progress_teacher
  ON teacher_chapter_progress(teacher_id);
