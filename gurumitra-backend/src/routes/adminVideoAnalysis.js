/**
 * Admin: Video Analysis – monthly progress (all teachers) and view any session's feedback.
 */
import express from 'express';
import { query } from '../config/db.js';
import { audit } from '../services/auditLog.js';
import { getPlanById, getPlanFilePath, setPlanChapters } from '../services/academicPlanStore.js';
import { extractChaptersFromPdf, isHolidayLine } from '../services/pdfChapters.js';

const MIN_VIDEOS_PER_MONTH = Math.max(1, parseInt(process.env.MIN_VIDEOS_PER_MONTH, 10) || 4);

const router = express.Router();

/** GET /api/admin/video-analysis/monthly-progress?month=YYYY-MM – list teachers with video count for the month. */
router.get('/monthly-progress', async (req, res) => {
  try {
    const monthParam = (req.query.month || '').trim() || null;
    const now = new Date();
    const year = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? parseInt(monthParam.slice(0, 4), 10)
      : now.getFullYear();
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? parseInt(monthParam.slice(5, 7), 10)
      : now.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const monthStart = `${monthStr}-01T00:00:00.000Z`;
    const monthEnd = month === 12 ? `${year + 1}-01-01T00:00:00.000Z` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;

    const teachersResult = await query(
      `SELECT id, name, email, school_id FROM users WHERE role = 'teacher' ORDER BY name`
    );
    const monthLabel = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const teachers = [];
    for (const u of teachersResult.rows) {
      const sessionsResult = await query(
        `SELECT id, created_at, status, upload_metadata
         FROM classroom_sessions WHERE teacher_id = $1 AND created_at >= $2 AND created_at < $3 ORDER BY created_at DESC`,
        [u.id, monthStart, monthEnd]
      );
      const sessions = sessionsResult.rows;
      const count = sessions.length;
      teachers.push({
        id: u.id,
        name: u.name,
        email: u.email,
        school_id: u.school_id || null,
        count,
        minimum: MIN_VIDEOS_PER_MONTH,
        met: count >= MIN_VIDEOS_PER_MONTH,
        sessions: sessions.map((s) => ({ id: s.id, created_at: s.created_at, status: s.status, upload_metadata: s.upload_metadata })),
      });
    }

    res.json({
      month: monthStr,
      monthLabel,
      minimum: MIN_VIDEOS_PER_MONTH,
      teachers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch monthly progress' });
  }
});

/** GET /api/admin/video-analysis/session/:sessionId/feedback – same shape as teacher video-feedback (admin can view any). */
router.get('/session/:sessionId/feedback', async (req, res) => {
  try {
    const videoId = req.params.sessionId;

    const sessionResult = await query(
      `SELECT id, teacher_id, status, error_message, analysis_result, academic_plan_id, chapter_index, created_at, uploaded_at
       FROM classroom_sessions WHERE id = $1`,
      [videoId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];
    const teacherId = session.teacher_id;

    if (session.status === 'processing' || session.status === 'pending') {
      return res.status(200).json({
        status: 'processing',
        message: 'AI analysis in progress',
        video_id: videoId,
        created_at: session.created_at,
      });
    }
    if (session.status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        video_id: videoId,
        error_message: session.error_message || null,
        created_at: session.created_at,
      });
    }

    const [feedbackResult, scoresResult] = await Promise.all([
      query('SELECT session_id, strengths, improvements, recommendations, created_at FROM feedback WHERE session_id = $1', [videoId]),
      query('SELECT clarity_score, engagement_score, interaction_score, overall_score FROM scores WHERE session_id = $1', [videoId]),
    ]);
    const feedbackRow = feedbackResult.rows[0];
    const scoresRow = scoresResult.rows[0];
    if (!feedbackRow || !scoresRow) {
      return res.status(200).json({
        status: 'processing',
        message: 'AI analysis in progress',
        video_id: videoId,
        created_at: session.created_at,
      });
    }

    const analysisResult = session.analysis_result && typeof session.analysis_result === 'object' ? session.analysis_result : null;
    let postureAnalysis = analysisResult && typeof analysisResult.posture_analysis === 'object' ? analysisResult.posture_analysis : null;
    const semanticFeedback = analysisResult && typeof analysisResult.semantic_feedback === 'object' ? analysisResult.semantic_feedback : null;

    if (postureAnalysis) {
      const apiBase = `${req.protocol}://${req.get('host')}`;
      postureAnalysis = { ...postureAnalysis };
      if (Array.isArray(postureAnalysis.annotated_images)) {
        postureAnalysis.annotated_images = postureAnalysis.annotated_images.map((url) => {
          const raw = typeof url === 'string' ? url.split('/').pop() : null;
          const filename = raw ? raw.split('?')[0] : null;
          return filename ? `${apiBase}/api/ai/posture-outputs/${filename}` : url;
        });
      }
      if (postureAnalysis.heatmap) {
        const raw = String(postureAnalysis.heatmap).split('/').pop();
        const hmFilename = raw ? raw.split('?')[0] : null;
        if (hmFilename) postureAnalysis.heatmap = `${apiBase}/api/ai/posture-outputs/${hmFilename}`;
      }
    }

    let chapterName = null;
    let syllabusPacingFeedback = null;
    const planId = session.academic_plan_id;
    const chapterIndex = session.chapter_index;
    if (planId != null && chapterIndex != null) {
      const plan = getPlanById(planId);
      if (plan && Array.isArray(plan.chapters) && plan.chapters[chapterIndex]) {
        chapterName = plan.chapters[chapterIndex];
      }
      const progResult = await query(
        `SELECT chapter_index, completed FROM teacher_chapter_progress WHERE teacher_id = $1 AND plan_id = $2`,
        [teacherId, planId]
      );
      let chapters = plan && Array.isArray(plan.chapters) ? plan.chapters : [];
      const fallbackOnly = chapters.length === 1 && chapters[0] === 'Syllabus / Plan';
      if ((chapters.length === 0 || fallbackOnly) && plan) {
        const filePath = getPlanFilePath(planId);
        if (filePath) {
          try {
            chapters = await extractChaptersFromPdf(filePath);
            chapters = chapters.filter((c) => !isHolidayLine(c));
            if (chapters.length > 0) setPlanChapters(planId, chapters);
          } catch (_) {}
        }
      }
      chapters = chapters.filter((c) => !isHolidayLine(c));
      const totalChapters = chapters.length || 1;
      const completedCount = progResult.rows.filter((r) => r.completed).length;
      const currentChapter = chapterIndex + 1;
      const status = completedCount >= totalChapters ? 'All chapters done' : (completedCount >= currentChapter ? 'On track' : 'In progress');
      syllabusPacingFeedback = {
        status,
        chapter_x_of_y: `Chapter ${currentChapter} of ${totalChapters}`,
        completed_count: completedCount,
        total_chapters: totalChapters,
        message: totalChapters > 0
          ? `Completed ${completedCount} of ${totalChapters} chapters.`
          : 'Syllabus progress not available.',
      };
    }

    const strengths = feedbackRow.strengths ? feedbackRow.strengths.split('\n').filter(Boolean) : [];
    const improvements = feedbackRow.improvements ? feedbackRow.improvements.split('\n').filter(Boolean) : [];
    const recommendations = feedbackRow.recommendations ? feedbackRow.recommendations.split('\n').filter(Boolean) : [];
    const teachingFeedback = { strengths, improvements, recommendations };
    const postureFeedback = postureAnalysis
      ? (Array.isArray(postureAnalysis.feedback) ? postureAnalysis.feedback : []) || []
      : [];

    audit(req.user.id, 'admin', 'video_feedback_view', 'session', videoId, null);

    res.json({
      video_id: videoId,
      chapter_name: chapterName,
      teaching_feedback: teachingFeedback,
      posture_feedback: postureFeedback,
      posture_analysis: postureAnalysis,
      syllabus_pacing_feedback: syllabusPacingFeedback,
      strengths,
      improvements,
      recommendations,
      score: scoresRow.overall_score != null ? Number(scoresRow.overall_score) : null,
      clarity_score: scoresRow.clarity_score,
      engagement_score: scoresRow.engagement_score,
      interaction_score: scoresRow.interaction_score,
      semantic_feedback: semanticFeedback,
      created_at: session.created_at,
      uploaded_at: session.uploaded_at || session.created_at,
      generated_at: feedbackRow.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch video feedback' });
  }
});

export default router;
