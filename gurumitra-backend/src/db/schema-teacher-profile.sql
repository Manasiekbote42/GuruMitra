-- Teacher profile: subjects and classes (multiple selection at signup)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subjects TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS classes TEXT[] DEFAULT '{}';
