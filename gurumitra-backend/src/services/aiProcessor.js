/**
 * Analysis-first pipeline: feedback exists ONLY after successful video analysis.
 * No demo, mock, or placeholder feedback. Same video (content_hash) → reuse stored result.
 * Phase 5: Session immutability—skip if is_locked; set analyzed_at and is_locked on completion. Audit log.
 */
import { query } from '../config/db.js';
import { analyzeVideo, mapAiResponseToDb } from './aiServiceClient.js';
import { audit } from './auditLog.js';

const PROCESSING_DELAY_MS = 2000;

function isValidScore(v) {
  return v != null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 5;
}

/** Only return true if analyzer response has all required scores; otherwise do not generate feedback. */
function hasValidAnalyzerScores(aiResponse) {
  return (
    isValidScore(aiResponse.pedagogy_score) &&
    isValidScore(aiResponse.engagement_score) &&
    isValidScore(aiResponse.delivery_score) &&
    isValidScore(aiResponse.curriculum_score)
  );
}

/** Build full analysis_result JSON for storage (Part 3 spec). Includes semantic_feedback when present (Phase 4). */
function buildAnalysisResult(sessionId, aiResponse) {
  const out = {
    session_id: sessionId,
    transcript_summary: aiResponse.transcript_summary || '',
    scores: {
      pedagogy: aiResponse.pedagogy_score,
      engagement: aiResponse.engagement_score,
      delivery: aiResponse.delivery_score,
      curriculum: aiResponse.curriculum_score,
    },
    strengths: Array.isArray(aiResponse.strengths) ? aiResponse.strengths : [],
    improvements: Array.isArray(aiResponse.improvements) ? aiResponse.improvements : [],
    recommendations: Array.isArray(aiResponse.recommendations) ? aiResponse.recommendations : [],
    metrics: {
      audio: aiResponse.metrics?.audio || {},
      content: aiResponse.metrics?.content || {},
    },
  };
  if (aiResponse.semantic_feedback && typeof aiResponse.semantic_feedback === 'object') {
    out.semantic_feedback = aiResponse.semantic_feedback;
  }
  return out;
}

/** Build analysis_result from existing DB row (when reusing by content_hash). Preserves semantic_feedback if present. */
function buildAnalysisResultFromRow(sessionId, row) {
  const prev = row.analysis_result && typeof row.analysis_result === 'object' ? row.analysis_result : null;
  const out = {
    session_id: sessionId,
    transcript_summary: row.transcript || '',
    scores: {
      pedagogy: row.interaction_score != null ? Number(row.interaction_score) : null,
      engagement: row.engagement_score != null ? Number(row.engagement_score) : null,
      delivery: row.clarity_score != null ? Number(row.clarity_score) : null,
      curriculum: row.overall_score != null ? Number(row.overall_score) : null,
    },
    strengths: row.strengths ? row.strengths.split('\n').filter(Boolean) : [],
    improvements: row.improvements ? row.improvements.split('\n').filter(Boolean) : [],
    recommendations: row.recommendations ? row.recommendations.split('\n').filter(Boolean) : [],
    metrics: {
      audio: row.audio_metrics || {},
      content: row.content_metrics || {},
    },
  };
  if (prev && prev.semantic_feedback) out.semantic_feedback = prev.semantic_feedback;
  return out;
}

/**
 * Process one session: reuse by content_hash or call analyzer. Feedback stored only when analysis succeeds.
 * If analysis fails (no URL, warning, empty transcript, invalid response) → session marked FAILED, no feedback.
 */
export function processSessionAsync(sessionId, teacherId) {
  setTimeout(async () => {
    try {
      const sessionResult = await query(
        'SELECT id, content_hash, video_url, upload_metadata, is_locked, school_id FROM classroom_sessions WHERE id = $1',
        [sessionId]
      );
      if (sessionResult.rows.length === 0) return;
      const row = sessionResult.rows[0];
      if (row.is_locked) return; // Phase 5: reject re-processing; session immutable once feedback generated

      const contentHash = row.content_hash || null;
      const videoUrl = row.video_url ? String(row.video_url).trim() : '';
      const schoolId = row.school_id || null;

      let clarity_score, engagement_score, interaction_score, overall_score;
      let strengths, improvements, recommendations;
      let transcript = null;
      let audio_metrics = null;
      let content_metrics = null;
      let analysis_result = null;

      if (contentHash) {
        const existing = await query(
          `SELECT cs.transcript, cs.audio_metrics, cs.content_metrics, cs.analysis_result,
                  f.strengths, f.improvements, f.recommendations,
                  sc.clarity_score, sc.engagement_score, sc.interaction_score, sc.overall_score
           FROM classroom_sessions cs
           JOIN feedback f ON f.session_id = cs.id
           JOIN scores sc ON sc.session_id = cs.id
           WHERE cs.content_hash = $1 AND cs.status = 'completed' AND cs.id != $2
           LIMIT 1`,
          [contentHash, sessionId]
        );

        if (existing.rows.length > 0) {
          const prev = existing.rows[0];
          clarity_score = parseFloat(prev.clarity_score);
          engagement_score = parseFloat(prev.engagement_score);
          interaction_score = parseFloat(prev.interaction_score);
          overall_score = parseFloat(prev.overall_score);
          if (isValidScore(clarity_score) && isValidScore(engagement_score) && isValidScore(interaction_score) && isValidScore(overall_score)) {
            strengths = prev.strengths ? prev.strengths.split('\n').filter(Boolean) : [];
            improvements = prev.improvements ? prev.improvements.split('\n').filter(Boolean) : [];
            recommendations = prev.recommendations ? prev.recommendations.split('\n').filter(Boolean) : [];
            transcript = prev.transcript;
            audio_metrics = prev.audio_metrics;
            content_metrics = prev.content_metrics;
            analysis_result = buildAnalysisResultFromRow(sessionId, prev);
          }
        }
      }

      if (clarity_score == null || !isValidScore(clarity_score)) {
        if (!videoUrl) {
          await query(
            `UPDATE classroom_sessions SET status = 'failed', error_message = $2 WHERE id = $1`,
            [sessionId, 'No video URL provided']
          );
          return;
        }
        const aiResponse = await analyzeVideo(videoUrl, sessionId);
        if (aiResponse.warning) {
          await query(
            `UPDATE classroom_sessions SET status = 'failed', error_message = $2 WHERE id = $1`,
            [sessionId, aiResponse.warning]
          );
          return;
        }
        if (!hasValidAnalyzerScores(aiResponse)) {
          await query(
            `UPDATE classroom_sessions SET status = 'failed', error_message = $2 WHERE id = $1`,
            [sessionId, 'Analysis did not return valid scores. No feedback generated.']
          );
          return;
        }
        if (aiResponse.metrics) {
          console.info('[session_metrics]', { session_id: sessionId, teacher_id: teacherId, metrics: aiResponse.metrics });
        }
        const mapped = mapAiResponseToDb(aiResponse);
        clarity_score = mapped.clarity_score;
        engagement_score = mapped.engagement_score;
        interaction_score = mapped.interaction_score;
        overall_score = mapped.overall_score;
        strengths = mapped.strengths;
        improvements = mapped.improvements;
        recommendations = mapped.recommendations;
        transcript = aiResponse.transcript_summary || null;
        audio_metrics = aiResponse.metrics && aiResponse.metrics.audio ? aiResponse.metrics.audio : null;
        content_metrics = aiResponse.metrics && aiResponse.metrics.content ? aiResponse.metrics.content : null;
        analysis_result = buildAnalysisResult(sessionId, aiResponse);
      }

      const strengthsStr = Array.isArray(strengths) ? strengths.join('\n') : (strengths || '');
      const improvementsStr = Array.isArray(improvements) ? improvements.join('\n') : (improvements || '');
      const recommendationsStr = Array.isArray(recommendations) ? recommendations.join('\n') : (recommendations || '');

      await query(
        `UPDATE classroom_sessions SET status = 'completed', transcript = $2, audio_metrics = $3, content_metrics = $4, analysis_result = $5, analyzed_at = NOW(), is_locked = TRUE WHERE id = $1`,
        [
          sessionId,
          transcript != null ? String(transcript).slice(0, 10000) : null,
          audio_metrics != null ? JSON.stringify(audio_metrics) : null,
          content_metrics != null ? JSON.stringify(content_metrics) : null,
          analysis_result != null ? JSON.stringify(analysis_result) : null,
        ]
      );
      await query(
        `INSERT INTO scores (session_id, clarity_score, engagement_score, interaction_score, overall_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, clarity_score, engagement_score, interaction_score, overall_score]
      );
      await query(
        `INSERT INTO feedback (session_id, strengths, improvements, recommendations)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, strengthsStr, improvementsStr, recommendationsStr]
      );
      await query(
        `INSERT INTO system_activity (user_id, action, details) VALUES ($1, 'session_processed', $2)`,
        [teacherId, JSON.stringify({ session_id: sessionId })]
      );
      audit(teacherId, 'teacher', 'feedback_generated', 'session', sessionId, schoolId);
    } catch (err) {
      console.error('AI processing failed for session', sessionId, err);
      const msg = (err && err.message) ? String(err.message).slice(0, 500) : 'Analysis failed';
      try {
        await query(
          `UPDATE classroom_sessions SET status = 'failed', error_message = $2 WHERE id = $1`,
          [sessionId, msg]
        );
      } catch (_) {}
    }
  }, PROCESSING_DELAY_MS);
}
