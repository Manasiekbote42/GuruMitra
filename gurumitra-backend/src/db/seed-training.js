import { query } from '../config/db.js';

const MODULES = [
  {
    title: 'Interactive Teaching Techniques',
    description: 'Learn how to increase student participation and two-way dialogue in the classroom.',
    improvement_area: 'interactive_teaching',
    video_url: 'https://www.youtube.com/embed/4gR7MvFjT_c',
    duration_minutes: 12,
    difficulty_level: 'Beginner',
  },
  {
    title: 'Lesson Structuring & Flow',
    description: 'Organize your lesson with a clear beginning, middle, and end for better learning outcomes.',
    improvement_area: 'lesson_structuring',
    video_url: 'https://www.youtube.com/embed/4gR7MvFjT_c',
    duration_minutes: 15,
    difficulty_level: 'Intermediate',
  },
  {
    title: 'Teaching with Real-Life Examples',
    description: 'Use concrete examples and real-world connections to make concepts stick.',
    improvement_area: 'real_life_examples',
    video_url: 'https://www.youtube.com/embed/4gR7MvFjT_c',
    duration_minutes: 10,
    difficulty_level: 'Beginner',
  },
  {
    title: 'Asking Effective Classroom Questions',
    description: 'Improve questioning techniques to check understanding and deepen thinking.',
    improvement_area: 'effective_questions',
    video_url: 'https://www.youtube.com/embed/4gR7MvFjT_c',
    duration_minutes: 14,
    difficulty_level: 'Intermediate',
  },
];

async function seed() {
  try {
    for (const m of MODULES) {
      await query(
        `INSERT INTO training_modules (title, description, improvement_area, video_url, duration_minutes, difficulty_level, created_for_role)
         VALUES ($1, $2, $3, $4, $5, $6, 'Teacher')`,
        [m.title, m.description, m.improvement_area, m.video_url, m.duration_minutes, m.difficulty_level]
      );
    }
    console.log('Training modules seed completed. Modules:', MODULES.length);
  } catch (err) {
    console.error('Seed training failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

seed();
