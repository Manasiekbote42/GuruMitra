import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { processSessionAsync } from '../services/aiProcessor.js';
import { audit } from '../services/auditLog.js';
import { computeContentHash, computeFileHash } from '../utils/contentHash.js';
import { getPlans, getPlanFilePath, getPlanById, setPlanChapters } from '../services/academicPlanStore.js';
import { extractChaptersFromPdf, isHolidayLine, isMetadataOrHolidayLine } from '../services/pdfChapters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(path.dirname(__dirname), '..', 'uploads');
const BASE_URL = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3001';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(file.originalname) ||
      (file.mimetype && file.mimetype.startsWith('video/'));
    cb(null, !!allowed);
  },
});

const router = express.Router();
router.use(authenticate, requireRole('teacher'));

/**
 * Upload classroom session. Generates unique content_hash from video_url + optional features.
 * Same video (same hash) reuses stored AI feedback. Results saved per session; dashboards read from DB.
 */
router.post('/sessions', async (req, res) => {
  try {
    const { video_url, duration_seconds, speech_ratio, audio_energy, video_title, subject, grade_class, date_of_recording, department, academic_plan_id, chapter_index } = req.body;
    const teacherId = req.user.id;
    const schoolId = req.user.school_id || (await query('SELECT school_id FROM users WHERE id = $1', [teacherId])).rows[0]?.school_id || null;

    // Update teacher's department in users table when provided (so management dashboard shows it)
    if (department !== undefined && department !== null && String(department).trim() !== '') {
      await query('UPDATE users SET department = $1, updated_at = NOW() WHERE id = $2', [String(department).trim(), teacherId]);
    }

    const metadata = {
      ...(duration_seconds != null && { duration_seconds }),
      ...(speech_ratio != null && { speech_ratio }),
      ...(audio_energy != null && { audio_energy }),
      ...(video_title != null && String(video_title).trim() && { video_title: String(video_title).trim() }),
      ...(subject != null && String(subject).trim() && { subject: String(subject).trim() }),
      ...(grade_class != null && String(grade_class).trim() && { grade_class: String(grade_class).trim() }),
      ...(date_of_recording != null && String(date_of_recording).trim() && { date_of_recording: String(date_of_recording).trim() }),
    };
    const metadataJson = Object.keys(metadata).length ? JSON.stringify(metadata) : null;

    const contentHash = computeContentHash(video_url || '', metadata);

    const planId = academic_plan_id != null && String(academic_plan_id).trim() ? String(academic_plan_id).trim() : null;
    const chIndex = chapter_index != null && Number.isInteger(Number(chapter_index)) ? Number(chapter_index) : null;
    const result = await query(
      `INSERT INTO classroom_sessions (teacher_id, school_id, video_url, status, upload_metadata, content_hash, academic_plan_id, chapter_index)
       VALUES ($1, $2, $3, 'processing', $4, $5, $6, $7)
       RETURNING id, teacher_id, video_url, uploaded_at, status, created_at, academic_plan_id, chapter_index`,
      [teacherId, schoolId, video_url || null, metadataJson, contentHash, planId, chIndex]
    );
    const session = result.rows[0];

    audit(teacherId, 'teacher', 'video_upload', 'session', session.id, schoolId);
    processSessionAsync(session.id, teacherId);

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * Upload classroom session from a video file (from device).
 * File is saved under uploads/<sessionId>.<ext> and served at /api/teacher/session-file/:id for the AI service.
 */
router.post('/sessions/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No video file provided. Choose a file and try again.' });
    }
    const teacherId = req.user.id;
    const sessionId = randomUUID();
    const ext = path.extname(req.file.originalname) || '.mp4';
    const contentHash = computeFileHash(req.file.buffer);
    const videoUrl = `${BASE_URL}/api/teacher/session-file/${sessionId}`;

    const { video_title, subject, grade_class, date_of_recording, department, academic_plan_id, chapter_index } = req.body || {};
    // Update teacher's department in users table when provided (so management dashboard shows it)
    if (department !== undefined && department !== null && String(department).trim() !== '') {
      await query('UPDATE users SET department = $1, updated_at = NOW() WHERE id = $2', [String(department).trim(), teacherId]);
    }
    const metadata = {
      ...(video_title != null && String(video_title).trim() && { video_title: String(video_title).trim() }),
      ...(subject != null && String(subject).trim() && { subject: String(subject).trim() }),
      ...(grade_class != null && String(grade_class).trim() && { grade_class: String(grade_class).trim() }),
      ...(date_of_recording != null && String(date_of_recording).trim() && { date_of_recording: String(date_of_recording).trim() }),
    };
    const metadataJson = Object.keys(metadata).length ? JSON.stringify(metadata) : null;

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const filePath = path.join(UPLOADS_DIR, `${sessionId}${ext}`);
    fs.writeFileSync(filePath, req.file.buffer);

    const schoolId = req.user.school_id || (await query('SELECT school_id FROM users WHERE id = $1', [teacherId])).rows[0]?.school_id || null;
    const planId = academic_plan_id != null && String(academic_plan_id).trim() ? String(academic_plan_id).trim() : null;
    const chIndex = chapter_index != null && Number.isInteger(Number(chapter_index)) ? Number(chapter_index) : null;
    const result = await query(
      `INSERT INTO classroom_sessions (id, teacher_id, school_id, video_url, status, upload_metadata, content_hash, academic_plan_id, chapter_index)
       VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7, $8)
       RETURNING id, teacher_id, video_url, uploaded_at, status, created_at, academic_plan_id, chapter_index`,
      [sessionId, teacherId, schoolId, videoUrl, metadataJson, contentHash, planId, chIndex]
    );
    const session = result.rows[0];

    audit(teacherId, 'teacher', 'video_upload', 'session', sessionId, schoolId);
    processSessionAsync(sessionId, teacherId);

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

/** Latest session for teacher (by created_at) with analysis_result. All values from stored session data. */
router.get('/sessions/latest', async (req, res) => {
  try {
    const result = await query(
      `SELECT cs.id, cs.teacher_id, cs.video_url, cs.status, cs.error_message, cs.created_at, cs.analysis_result,
              f.strengths, f.improvements, f.recommendations,
              sc.clarity_score, sc.engagement_score, sc.interaction_score, sc.overall_score
       FROM classroom_sessions cs
       LEFT JOIN feedback f ON f.session_id = cs.id
       LEFT JOIN scores sc ON sc.session_id = cs.id
       WHERE cs.teacher_id = $1
       ORDER BY cs.created_at DESC
       LIMIT 1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(200).json({ session: null, summary: null });
    }
    const row = result.rows[0];
    const session = {
      session_id: row.id,
      teacher_id: row.teacher_id,
      video_url: row.video_url,
      status: row.status,
      error_message: row.error_message || null,
      created_at: row.created_at,
      analysis_result: row.analysis_result || null,
    };
    const summary = row.status === 'completed' && (row.clarity_score != null || row.analysis_result)
      ? {
          scores: row.analysis_result?.scores || {
            pedagogy: row.interaction_score != null ? Number(row.interaction_score) : null,
            engagement: row.engagement_score != null ? Number(row.engagement_score) : null,
            delivery: row.clarity_score != null ? Number(row.clarity_score) : null,
            curriculum: row.overall_score != null ? Number(row.overall_score) : null,
          },
          strengths: row.analysis_result?.strengths || (row.strengths ? row.strengths.split('\n').filter(Boolean) : []),
          improvements: row.analysis_result?.improvements || (row.improvements ? row.improvements.split('\n').filter(Boolean) : []),
          recommendations: row.analysis_result?.recommendations || (row.recommendations ? row.recommendations.split('\n').filter(Boolean) : []),
          semantic_feedback: row.analysis_result?.semantic_feedback || null,
        }
      : null;
    res.json({ session, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch latest session' });
  }
});

/**
 * Get AI feedback for a session. Returns 200 + { status: 'processing' } if not ready; no mock data.
 */
router.get('/sessions/:sessionId/feedback', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;

    const sessionResult = await query(
      'SELECT id, status, error_message FROM classroom_sessions WHERE id = $1 AND teacher_id = $2',
      [sessionId, teacherId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];

    if (session.status === 'processing' || session.status === 'pending') {
      return res.status(200).json({ status: 'processing', message: 'AI analysis in progress' });
    }
    if (session.status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        message: 'Analysis failed',
        error_message: session.error_message || null,
      });
    }
    // Only return feedback when status is 'completed'; no synthetic payload
    if (session.status !== 'completed') {
      return res.status(200).json({ status: 'processing', message: 'AI analysis in progress' });
    }

    const [feedbackResult, sessionRow] = await Promise.all([
      query('SELECT session_id, strengths, improvements, recommendations, created_at FROM feedback WHERE session_id = $1', [sessionId]),
      query('SELECT analysis_result FROM classroom_sessions WHERE id = $1 AND teacher_id = $2', [sessionId, teacherId]),
    ]);
    const row = feedbackResult.rows[0];
    if (!row) {
      return res.status(200).json({ status: 'processing', message: 'AI analysis in progress' });
    }
    const analysisResult = sessionRow.rows[0]?.analysis_result || null;
    const semanticFeedback = analysisResult && typeof analysisResult.semantic_feedback === 'object' ? analysisResult.semantic_feedback : null;
    let postureAnalysis = analysisResult && typeof analysisResult.posture_analysis === 'object' ? analysisResult.posture_analysis : null;

    // Rewrite posture image URLs to go through our proxy (so frontend can load them)
    if (postureAnalysis) {
      const apiBase = `${req.protocol}://${req.get('host')}`;
      postureAnalysis = { ...postureAnalysis };
      if (Array.isArray(postureAnalysis.annotated_images)) {
        postureAnalysis.annotated_images = postureAnalysis.annotated_images.map((url) => {
          const raw = typeof url === 'string' ? url.split('/').pop() : null;
          const filename = raw ? raw.split('?')[0] : null; // strip query for proxy
          return filename ? `${apiBase}/api/ai/posture-outputs/${filename}` : url;
        });
      }
      if (postureAnalysis.heatmap) {
        const raw = String(postureAnalysis.heatmap).split('/').pop();
        const hmFilename = raw ? raw.split('?')[0] : null;
        if (hmFilename) postureAnalysis.heatmap = `${apiBase}/api/ai/posture-outputs/${hmFilename}`;
      }
    }

    audit(teacherId, 'teacher', 'feedback_view', 'session', sessionId, req.user.school_id);

    res.json({
      session_id: row.session_id,
      strengths: row.strengths ? row.strengths.split('\n').filter(Boolean) : [],
      improvements: row.improvements ? row.improvements.split('\n').filter(Boolean) : [],
      recommendations: row.recommendations ? row.recommendations.split('\n').filter(Boolean) : [],
      semantic_feedback: semanticFeedback,
      posture_analysis: postureAnalysis,
      generated_at: row.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

/**
 * Get scores for a session. Returns 200 + { status: 'processing' } if not ready; no mock data.
 */
router.get('/sessions/:sessionId/scores', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;

    const sessionResult = await query(
      'SELECT id, status, error_message FROM classroom_sessions WHERE id = $1 AND teacher_id = $2',
      [sessionId, teacherId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];

    if (session.status === 'processing' || session.status === 'pending') {
      return res.status(200).json({ status: 'processing', message: 'AI analysis in progress' });
    }
    if (session.status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        message: 'Analysis failed',
        error_message: session.error_message || null,
      });
    }
    if (session.status !== 'completed') {
      return res.status(200).json({ status: 'processing', message: 'AI analysis in progress' });
    }

    const scoresResult = await query(
      'SELECT session_id, clarity_score, engagement_score, interaction_score, overall_score, created_at FROM scores WHERE session_id = $1',
      [sessionId]
    );
    const row = scoresResult.rows[0];
    if (!row) {
      return res.status(200).json({ status: 'processing', message: 'AI analysis in progress' });
    }

    res.json({
      session_id: row.session_id,
      clarity_score: parseFloat(row.clarity_score),
      engagement_score: parseFloat(row.engagement_score),
      interaction_score: parseFloat(row.interaction_score),
      overall_score: parseFloat(row.overall_score),
      generated_at: row.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

/**
 * Training recommendations derived from teacher's latest feedback in DB. No mock list.
 */
router.get('/recommendations', async (req, res) => {
  try {
    const teacherId = req.user.id;

    const result = await query(
      `SELECT f.improvements, f.recommendations
       FROM feedback f
       JOIN classroom_sessions s ON s.id = f.session_id
       WHERE s.teacher_id = $1 AND s.status = 'completed'
       ORDER BY f.created_at DESC LIMIT 1`,
      [teacherId]
    );
    const row = result.rows[0];

    const modules = [];
    if (row?.improvements) {
      row.improvements.split('\n').filter(Boolean).forEach((line, i) => {
        modules.push({
          id: `imp-${i}`,
          title: line.slice(0, 60) + (line.length > 60 ? '…' : ''),
          description: line,
          duration: '5 min',
          priority: 'high',
        });
      });
    }
    if (row?.recommendations) {
      row.recommendations.split('\n').filter(Boolean).forEach((line, i) => {
        modules.push({
          id: `rec-${i}`,
          title: line.slice(0, 60) + (line.length > 60 ? '…' : ''),
          description: line,
          duration: '10 min',
          priority: 'medium',
        });
      });
    }

    res.json({ modules, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

/**
 * Get complete video feedback for Syllabus/Plan (per-video, same quality as Expert Feedback).
 * videoId = session id. Returns teaching_feedback, posture_feedback, syllabus_pacing_feedback, strengths, improvements, score.
 */
router.get('/video-feedback/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const teacherId = req.user.id;

    const sessionResult = await query(
      `SELECT id, status, error_message, analysis_result, academic_plan_id, chapter_index, created_at, uploaded_at
       FROM classroom_sessions WHERE id = $1 AND teacher_id = $2`,
      [videoId, teacherId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];

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
      if (chapters.length === 0 && plan) {
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
      const totalChapters = chapters.length;
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
          ? `You have completed ${completedCount} of ${totalChapters} chapters. ${completedCount >= totalChapters ? 'All chapters done!' : `Keep going — ${totalChapters - completedCount} remaining.`}`
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

    audit(teacherId, 'teacher', 'video_feedback_view', 'session', videoId, req.user.school_id);

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

/** List teacher's own sessions (single source of truth: DB only). Session history by created_at. Optional: plan_id, chapter_index for Video Analysis. */
router.get('/sessions', async (req, res) => {
  try {
    const planId = (req.query.plan_id || '').trim() || null;
    const chapterIndex = req.query.chapter_index != null ? Number(req.query.chapter_index) : null;
    let result;
    if (planId) {
      if (chapterIndex !== null && !Number.isNaN(chapterIndex)) {
        result = await query(
          `SELECT id, teacher_id, video_url, uploaded_at, status, error_message, created_at, academic_plan_id, chapter_index
           FROM classroom_sessions WHERE teacher_id = $1 AND academic_plan_id = $2 AND chapter_index = $3 ORDER BY created_at DESC`,
          [req.user.id, planId, chapterIndex]
        );
      } else {
        result = await query(
          `SELECT id, teacher_id, video_url, uploaded_at, status, error_message, created_at, academic_plan_id, chapter_index
           FROM classroom_sessions WHERE teacher_id = $1 AND academic_plan_id = $2 ORDER BY created_at DESC`,
          [req.user.id, planId]
        );
      }
    } else {
      result = await query(
        `SELECT id, teacher_id, video_url, uploaded_at, status, error_message, created_at, academic_plan_id, chapter_index
         FROM classroom_sessions WHERE teacher_id = $1 ORDER BY created_at DESC`,
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/** Get chapters for a plan (parse PDF and cache in meta). Only real chapters from the planning table; holidays are never returned. */
router.get('/academic-plan/chapters/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = getPlanById(planId);
    if (!plan) return res.status(404).json({ error: 'Academic plan not found' });
    const filePath = getPlanFilePath(planId);
    if (!filePath) return res.status(404).json({ error: 'Plan PDF not found' });

    let chapters = Array.isArray(plan.chapters) ? plan.chapters : [];
    const hasInvalidCache = chapters.some((c) => isMetadataOrHolidayLine(c));
    const hasFallbackOnly = chapters.length === 1 && chapters[0] === 'Syllabus / Plan';
    if (hasInvalidCache || chapters.length === 0 || hasFallbackOnly) {
      if (hasInvalidCache) setPlanChapters(planId, []); // clear bad cache so we don't reuse it
      try {
        chapters = await extractChaptersFromPdf(filePath);
      } catch (parseErr) {
        console.error('PDF chapter extraction failed:', parseErr);
        chapters = [];
      }
      chapters = chapters.filter((c) => !isHolidayLine(c));
      if (chapters.length > 0) setPlanChapters(planId, chapters);
    } else {
      chapters = chapters.filter((c) => !isHolidayLine(c));
      if (chapters.length === 0) {
        try {
          chapters = await extractChaptersFromPdf(filePath);
        } catch (_) {
          chapters = [];
        }
        chapters = chapters.filter((c) => !isHolidayLine(c));
        if (chapters.length > 0) setPlanChapters(planId, chapters);
      }
    }
    res.json({ chapters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get chapters' });
  }
});

/** Mark a chapter as completed (or uncompleted). Body: { plan_id, chapter_index, completed } */
router.post('/chapter-complete', async (req, res) => {
  try {
    const { plan_id, chapter_index, completed } = req.body || {};
    const planId = (plan_id != null && String(plan_id).trim()) ? String(plan_id).trim() : null;
    const chIndex = chapter_index != null && Number.isInteger(Number(chapter_index)) ? Number(chapter_index) : null;
    if (!planId || chIndex == null || Number.isNaN(chIndex)) {
      return res.status(400).json({ error: 'plan_id and chapter_index are required' });
    }
    const teacherId = req.user.id;
    await query(
      `INSERT INTO teacher_chapter_progress (teacher_id, plan_id, chapter_index, completed, completed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (teacher_id, plan_id, chapter_index)
       DO UPDATE SET completed = $4, completed_at = $5`,
      [teacherId, planId, chIndex, !!completed, completed ? new Date().toISOString() : null]
    );
    res.json({ ok: true, completed: !!completed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update chapter progress' });
  }
});

/** Get chapter progress for a plan (for pacing). */
router.get('/chapter-progress', async (req, res) => {
  try {
    const planId = (req.query.plan_id || '').trim();
    if (!planId) return res.status(400).json({ error: 'plan_id is required' });
    let plan = getPlanById(planId);
    if (!plan) return res.status(404).json({ error: 'Academic plan not found' });
    let chapters = Array.isArray(plan.chapters) ? plan.chapters : [];
    const hasInvalidCache = chapters.some((c) => isMetadataOrHolidayLine(c));
    const hasFallbackOnly = chapters.length === 1 && chapters[0] === 'Syllabus / Plan';
    if (hasInvalidCache || chapters.length === 0 || hasFallbackOnly) {
      const filePath = getPlanFilePath(planId);
      if (filePath) {
        if (hasInvalidCache) setPlanChapters(planId, []);
        try {
          chapters = await extractChaptersFromPdf(filePath);
        } catch (_) {
          chapters = [];
        }
        chapters = chapters.filter((c) => !isHolidayLine(c));
        if (chapters.length > 0) setPlanChapters(planId, chapters);
      }
    } else {
      chapters = chapters.filter((c) => !isHolidayLine(c));
    }
    const result = await query(
      `SELECT chapter_index, completed, completed_at FROM teacher_chapter_progress
       WHERE teacher_id = $1 AND plan_id = $2`,
      [req.user.id, planId]
    );
    const byChapter = {};
    (result.rows || []).forEach((r) => {
      byChapter[r.chapter_index] = { completed: r.completed, completed_at: r.completed_at };
    });
    const completedCount = Object.values(byChapter).filter((v) => v.completed).length;
    const totalChapters = chapters.length;
    const paceMessage = totalChapters > 0
      ? `You have completed ${completedCount} of ${totalChapters} chapters. ${completedCount >= totalChapters ? 'All chapters done!' : `Keep going — ${totalChapters - completedCount} remaining.`}`
      : 'Select an academic plan to see your progress.';
    res.json({
      plan_id: planId,
      chapters,
      completedByChapter: byChapter,
      completedCount,
      totalChapters,
      paceMessage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch chapter progress' });
  }
});

/** List all academic plans (uploaded by admin) for teachers to view. */
router.get('/academic-plan', (req, res) => {
  const plans = getPlans().map((p) => ({
    id: p.id,
    subject: p.subject,
    class: p.class,
    uploadedAt: p.uploadedAt,
    uploadedByName: p.uploadedByName,
    url: `/api/teacher/academic-plan/file/${p.id}`,
  }));
  res.json({ plans });
});

/** Serve an academic plan PDF by id (teacher only). */
router.get('/academic-plan/file/:id', (req, res) => {
  const filePath = getPlanFilePath(req.params.id);
  if (!filePath) {
    return res.status(404).json({ error: 'Academic plan not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath, (err) => {
    if (err) res.status(500).json({ error: 'Error sending file' });
  });
});

export default router;
