/**
 * Client for the analyzer microservice. Sends video_url, receives deterministic feedback.
 * No mock or fallback: failures surface to the caller.
 * Future real-time: replace analyzeVideo() with a WebSocket/streaming client (e.g. Whisper chunks);
 * aiProcessor continues to store final results by session_id.
 */
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 300000; // 5 min default (download + Whisper + analysis)

/**
 * Call analyzer service (Whisper + audio + content). Optional session_id for session-level response.
 * @param {string} videoUrl - URL of the uploaded classroom video
 * @param {string} [sessionId] - optional session UUID for response
 * @returns {Promise<{ warning?, pedagogy_score, engagement_score, delivery_score, curriculum_score, feedback, strengths, improvements, recommendations, metrics? }>}
 */
export async function analyzeVideo(videoUrl, sessionId = null) {
  if (!videoUrl || !String(videoUrl).trim()) {
    throw new Error('video_url is required for analysis');
  }
  const body = { video_url: String(videoUrl).trim() };
  if (sessionId) body.session_id = sessionId;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI service error ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('AI service timeout');
    throw err;
  }
}

/**
 * Map AI service response to our DB schema (scores + feedback table columns).
 */
export function mapAiResponseToDb(aiResponse) {
  return {
    clarity_score: aiResponse.delivery_score,
    engagement_score: aiResponse.engagement_score,
    interaction_score: aiResponse.pedagogy_score,
    overall_score: aiResponse.curriculum_score,
    strengths: Array.isArray(aiResponse.strengths) ? aiResponse.strengths.join('\n') : (aiResponse.feedback || ''),
    improvements: Array.isArray(aiResponse.improvements) ? aiResponse.improvements.join('\n') : '',
    recommendations: Array.isArray(aiResponse.recommendations) ? aiResponse.recommendations.join('\n') : '',
  };
}
