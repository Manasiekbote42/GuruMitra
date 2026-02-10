import express from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { getRecommendedAreas } from '../services/trainingRecommendations.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/training/recommendations/:teacherId
 * Returns rule-based training module recommendations for the given teacher using their latest session analysis.
 * Access: teacher (own id only), management (teachers in same school), admin (any).
 */
router.get('/recommendations/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID is required' });
    }

    if (role === 'teacher') {
      if (teacherId !== userId) {
        return res.status(403).json({ error: 'You can only view your own recommendations' });
      }
    } else if (role === 'management') {
      if (req.user.school_id == null) {
        return res.status(403).json({ error: 'No school assigned' });
      }
      const schoolCheck = await query(
        'SELECT id FROM users WHERE id = $1 AND role = $2 AND school_id = $3',
        [teacherId, 'teacher', req.user.school_id]
      );
      if (schoolCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You can only view recommendations for teachers in your school' });
      }
    }
    // admin: no extra check

    const sessionResult = await query(
      `SELECT content_metrics, analysis_result FROM classroom_sessions
       WHERE teacher_id = $1 AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [teacherId]
    );
    const row = sessionResult.rows[0];
    const content = (row && row.content_metrics) || (row && row.analysis_result && row.analysis_result.metrics && row.analysis_result.metrics.content) || null;

    const { areas, reasons } = getRecommendedAreas(content);

    if (areas.length === 0) {
      return res.json({
        message: 'Based on your recent teaching session, your scores look good. Keep up the practice; you can still browse all training modules from the Training page.',
        weak_areas: [],
        recommendations: [],
        session_used: !!row,
      });
    }

    const placeholders = areas.map((_, i) => `$${i + 1}`).join(', ');
    const modulesResult = await query(
      `SELECT id, title, description, improvement_area, video_url, duration_minutes, difficulty_level, created_for_role
       FROM training_modules
       WHERE improvement_area IN (${placeholders}) AND created_for_role = 'Teacher'
       ORDER BY improvement_area`,
      areas
    );

    const recommendations = modulesResult.rows.map((m) => ({
      module: {
        id: m.id,
        title: m.title,
        description: m.description,
        improvement_area: m.improvement_area,
        video_url: m.video_url,
        duration_minutes: m.duration_minutes,
        difficulty_level: m.difficulty_level,
        created_for_role: m.created_for_role,
      },
      reason: reasons[m.improvement_area] || 'Recommended based on your session.',
    }));

    const weak_areas = areas.map((a) => {
      const labels = {
        interactive_teaching: 'Student interaction',
        lesson_structuring: 'Lesson structure and flow',
        real_life_examples: 'Using real-life examples',
        effective_questions: 'Asking effective questions',
      };
      return { area: a, label: labels[a] || a, reason: reasons[a] };
    });

    res.json({
      message: 'Based on your recent teaching session, we recommend the following modules to help you improve.',
      weak_areas,
      recommendations,
      session_used: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch training recommendations' });
  }
});

export default router;
