import express from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole, requireSchoolForManagement } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, requireRole('management', 'admin'), requireSchoolForManagement);

// Recent sessions (for Management dashboard). Management: own school only; Admin: all.
router.get('/recent-sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const isAdmin = req.user.role === 'admin';
    const result = isAdmin
      ? await query(
          `SELECT s.id, s.teacher_id, s.video_url, s.status, s.created_at, u.name AS teacher_name, u.department
           FROM classroom_sessions s
           JOIN users u ON u.id = s.teacher_id
           ORDER BY s.created_at DESC
           LIMIT $1`,
          [limit]
        )
      : await query(
          `SELECT s.id, s.teacher_id, s.video_url, s.status, s.created_at, u.name AS teacher_name, u.department
           FROM classroom_sessions s
           JOIN users u ON u.id = s.teacher_id
           WHERE s.school_id = $1
           ORDER BY s.created_at DESC
           LIMIT $2`,
          [req.user.school_id, limit]
        );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recent sessions' });
  }
});

// Get all teachers. Management: own school only; Admin: all.
router.get('/teachers', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = isAdmin
      ? await query(`SELECT id, name, email, role, department, school_id, created_at FROM users WHERE role = 'teacher' ORDER BY name`)
      : await query(
          `SELECT id, name, email, role, department, school_id, created_at FROM users WHERE role = 'teacher' AND school_id = $1 ORDER BY name`,
          [req.user.school_id]
        );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// Teacher-wise summary. Management: own school only; Admin: all.
const LOW_AVERAGE_THRESHOLD = 3.0;
router.get('/teachers/summary', async (req, res) => {
  try {
    const lastN = Math.min(parseInt(req.query.last_sessions, 10) || 10, 50);
    const isAdmin = req.user.role === 'admin';
    const result = await query(
      isAdmin
        ? `SELECT u.id AS teacher_id, u.name AS teacher_name, u.department,
             COUNT(s.id) FILTER (WHERE s.status = 'completed') AS completed_count,
             COUNT(s.id) AS total_sessions,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_overall_score,
             ROUND(AVG(sc.clarity_score)::numeric, 2) AS avg_clarity,
             ROUND(AVG(sc.engagement_score)::numeric, 2) AS avg_engagement,
             ROUND(AVG(sc.interaction_score)::numeric, 2) AS avg_interaction
       FROM users u
       LEFT JOIN classroom_sessions s ON s.teacher_id = u.id
       LEFT JOIN scores sc ON sc.session_id = s.id AND s.status = 'completed'
       WHERE u.role = 'teacher'
       GROUP BY u.id, u.name, u.department
       ORDER BY u.name`
        : `SELECT u.id AS teacher_id, u.name AS teacher_name, u.department,
             COUNT(s.id) FILTER (WHERE s.status = 'completed') AS completed_count,
             COUNT(s.id) AS total_sessions,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_overall_score,
             ROUND(AVG(sc.clarity_score)::numeric, 2) AS avg_clarity,
             ROUND(AVG(sc.engagement_score)::numeric, 2) AS avg_engagement,
             ROUND(AVG(sc.interaction_score)::numeric, 2) AS avg_interaction
       FROM users u
       LEFT JOIN classroom_sessions s ON s.teacher_id = u.id
       LEFT JOIN scores sc ON sc.session_id = s.id AND s.status = 'completed'
       WHERE u.role = 'teacher' AND u.school_id = $1
       GROUP BY u.id, u.name, u.department
       ORDER BY u.name`,
      isAdmin ? [] : [req.user.school_id]
    );
    const withTrend = await Promise.all(
      result.rows.map(async (r) => {
        const trendResult = await query(
          `SELECT sc.overall_score, sc.created_at
           FROM classroom_sessions cs
           JOIN scores sc ON sc.session_id = cs.id
           WHERE cs.teacher_id = $1 AND cs.status = 'completed'
           ORDER BY cs.created_at DESC
           LIMIT $2`,
          [r.teacher_id, lastN]
        );
        const trend = trendResult.rows.map((row) => ({
          score: row.overall_score != null ? parseFloat(row.overall_score) : null,
          at: row.created_at,
        }));
        const avg = r.avg_overall_score != null ? parseFloat(r.avg_overall_score) : null;
        return {
          teacher_id: r.teacher_id,
          teacher_name: r.teacher_name,
          department: r.department || null,
          total_sessions: parseInt(r.total_sessions, 10) || 0,
          completed_sessions: parseInt(r.completed_count, 10) || 0,
          average_scores: {
            overall: avg,
            clarity: r.avg_clarity != null ? parseFloat(r.avg_clarity) : null,
            engagement: r.avg_engagement != null ? parseFloat(r.avg_engagement) : null,
            interaction: r.avg_interaction != null ? parseFloat(r.avg_interaction) : null,
          },
          growth_trend_last_n: trend,
          low_average_flag: avg != null && avg < LOW_AVERAGE_THRESHOLD,
        };
      })
    );
    res.json(withTrend);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teachers summary' });
  }
});

// Latest AI feedback per teacher. Management: own school only; Admin: all.
router.get('/teachers/feedback-summary', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = await query(
      isAdmin
        ? `SELECT u.id AS teacher_id, u.name AS teacher_name, u.department,
             s.id AS session_id, s.status AS session_status, s.created_at AS session_at, s.analysis_result,
             f.strengths, f.improvements, f.recommendations,
             sc.overall_score, sc.clarity_score, sc.engagement_score, sc.interaction_score
      FROM users u
      LEFT JOIN LATERAL (
        SELECT cs.id, cs.status, cs.created_at, cs.analysis_result
        FROM classroom_sessions cs
        WHERE cs.teacher_id = u.id AND cs.status = 'completed'
        ORDER BY cs.created_at DESC LIMIT 1
      ) s ON true
      LEFT JOIN feedback f ON f.session_id = s.id
      LEFT JOIN scores sc ON sc.session_id = s.id
      WHERE u.role = 'teacher'
      ORDER BY u.name`
        : `SELECT u.id AS teacher_id, u.name AS teacher_name, u.department,
             s.id AS session_id, s.status AS session_status, s.created_at AS session_at, s.analysis_result,
             f.strengths, f.improvements, f.recommendations,
             sc.overall_score, sc.clarity_score, sc.engagement_score, sc.interaction_score
      FROM users u
      LEFT JOIN LATERAL (
        SELECT cs.id, cs.status, cs.created_at, cs.analysis_result
        FROM classroom_sessions cs
        WHERE cs.teacher_id = u.id AND cs.status = 'completed'
        ORDER BY cs.created_at DESC LIMIT 1
      ) s ON true
      LEFT JOIN feedback f ON f.session_id = s.id
      LEFT JOIN scores sc ON sc.session_id = s.id
      WHERE u.role = 'teacher' AND u.school_id = $1
      ORDER BY u.name`,
      isAdmin ? [] : [req.user.school_id]
    );
    const list = result.rows.map((r) => ({
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      department: r.department,
      latest_session_id: r.session_id,
      latest_session_at: r.session_at,
      latest_status: r.session_status,
      overall_score: r.overall_score != null ? parseFloat(r.overall_score) : null,
      clarity_score: r.clarity_score != null ? parseFloat(r.clarity_score) : null,
      engagement_score: r.engagement_score != null ? parseFloat(r.engagement_score) : null,
      interaction_score: r.interaction_score != null ? parseFloat(r.interaction_score) : null,
      strengths: r.strengths ? r.strengths.split('\n').filter(Boolean) : [],
      improvements: r.improvements ? r.improvements.split('\n').filter(Boolean) : [],
      recommendations: r.recommendations ? r.recommendations.split('\n').filter(Boolean) : [],
      semantic_feedback: r.analysis_result?.semantic_feedback || null,
    }));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feedback summary' });
  }
});

// Department-wise average scores. Management: own school only; Admin: all.
router.get('/scores/department', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = await query(
      isAdmin
        ? `SELECT COALESCE(NULLIF(TRIM(u.department), ''), 'Unassigned') AS department,
             COUNT(DISTINCT u.id) AS teacher_count,
             COUNT(DISTINCT s.id) AS session_count,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_overall_score,
             ROUND(AVG(sc.clarity_score)::numeric, 2) AS avg_clarity,
             ROUND(AVG(sc.engagement_score)::numeric, 2) AS avg_engagement,
             ROUND(AVG(sc.interaction_score)::numeric, 2) AS avg_interaction
      FROM users u
      LEFT JOIN classroom_sessions s ON s.teacher_id = u.id AND s.status = 'completed'
      LEFT JOIN scores sc ON sc.session_id = s.id
      WHERE u.role = 'teacher'
      GROUP BY COALESCE(NULLIF(TRIM(u.department), ''), 'Unassigned')
      ORDER BY department`
        : `SELECT COALESCE(NULLIF(TRIM(u.department), ''), 'Unassigned') AS department,
             COUNT(DISTINCT u.id) AS teacher_count,
             COUNT(DISTINCT s.id) AS session_count,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_overall_score,
             ROUND(AVG(sc.clarity_score)::numeric, 2) AS avg_clarity,
             ROUND(AVG(sc.engagement_score)::numeric, 2) AS avg_engagement,
             ROUND(AVG(sc.interaction_score)::numeric, 2) AS avg_interaction
      FROM users u
      LEFT JOIN classroom_sessions s ON s.teacher_id = u.id AND s.status = 'completed'
      LEFT JOIN scores sc ON sc.session_id = s.id
      WHERE u.role = 'teacher' AND u.school_id = $1
      GROUP BY COALESCE(NULLIF(TRIM(u.department), ''), 'Unassigned')
      ORDER BY department`,
      isAdmin ? [] : [req.user.school_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch department scores' });
  }
});

// Performance trends by month. Management: own school only; Admin: all.
router.get('/scores/trends', async (req, res) => {
  try {
    const { year } = req.query;
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let paramIndex = 1;
    let whereClause = "WHERE sc.created_at >= NOW() - INTERVAL '2 years'";
    if (!isAdmin) {
      whereClause += ` AND s.school_id = $${paramIndex}`;
      params.push(req.user.school_id);
      paramIndex++;
    }
    if (year) {
      whereClause += ` AND EXTRACT(YEAR FROM sc.created_at) = $${paramIndex}`;
      params.push(year);
    }
    const result = await query(
      `SELECT TO_CHAR(DATE_TRUNC('month', sc.created_at), 'YYYY-MM') AS month,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_score,
             COUNT(sc.id) AS score_count
      FROM scores sc
      JOIN classroom_sessions s ON s.id = sc.session_id
      ${whereClause}
      GROUP BY DATE_TRUNC('month', sc.created_at)
      ORDER BY month DESC
      LIMIT 12`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Simpler trends: last 12 months. Management: own school only; Admin: all.
router.get('/scores/quarterly', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = isAdmin
      ? await query(`
      SELECT TO_CHAR(DATE_TRUNC('quarter', sc.created_at), 'YYYY-Q') AS quarter,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_overall_score,
             COUNT(sc.id) AS session_count
      FROM scores sc
      JOIN classroom_sessions s ON s.id = sc.session_id
      WHERE sc.created_at >= NOW() - INTERVAL '2 years'
      GROUP BY DATE_TRUNC('quarter', sc.created_at)
      ORDER BY quarter DESC
      LIMIT 8
    `)
      : await query(
          `SELECT TO_CHAR(DATE_TRUNC('quarter', sc.created_at), 'YYYY-Q') AS quarter,
             ROUND(AVG(sc.overall_score)::numeric, 2) AS avg_overall_score,
             COUNT(sc.id) AS session_count
      FROM scores sc
      JOIN classroom_sessions s ON s.id = sc.session_id
      WHERE sc.created_at >= NOW() - INTERVAL '2 years' AND s.school_id = $1
      GROUP BY DATE_TRUNC('quarter', sc.created_at)
      ORDER BY quarter DESC
      LIMIT 8`,
          [req.user.school_id]
        );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quarterly trends' });
  }
});

export default router;
