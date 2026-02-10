-- Phase 4: Training modules for teacher improvement (rule-based recommendations)
CREATE TABLE IF NOT EXISTS training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  improvement_area VARCHAR(100) NOT NULL,
  video_url TEXT NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  difficulty_level VARCHAR(50) NOT NULL CHECK (difficulty_level IN ('Beginner', 'Intermediate')),
  created_for_role VARCHAR(50) NOT NULL DEFAULT 'Teacher',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_modules_improvement_area ON training_modules(improvement_area);
CREATE INDEX IF NOT EXISTS idx_training_modules_created_for_role ON training_modules(created_for_role);
