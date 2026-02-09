/**
 * Client for the analyzer microservice. Sends video_url, receives deterministic feedback.
 * No mock or fallback: failures surface to the caller.
 * Uses Node http/https (not fetch) so the full request respects one long timeout;
 * fetch/undici has a separate headers timeout that fires before our AbortController.
 */
import http from 'http';
import https from 'https';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 600000; // 10 min (download + Whisper + Gemini)

/**
 * Call analyzer service (Whisper + audio + content). Optional session_id for session-level response.
 * @param {string} videoUrl - URL of the uploaded classroom video
 * @param {string} [sessionId] - optional session UUID for response
 * @returns {Promise<{ warning?, pedagogy_score, engagement_score, delivery_score, curriculum_score, feedback, strengths, improvements, recommendations, metrics? }>}
 */
export function analyzeVideo(videoUrl, sessionId = null) {
  if (!videoUrl || !String(videoUrl).trim()) {
    return Promise.reject(new Error('video_url is required for analysis'));
  }
  const body = { video_url: String(videoUrl).trim() };
  if (sessionId) body.session_id = sessionId;
  const bodyStr = JSON.stringify(body);
  const base = AI_SERVICE_URL.replace(/\/$/, '');
  const url = new URL(`${base}/analyze`);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
    },
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`AI service error ${res.statusCode}: ${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`AI service invalid JSON: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ECONNRESET' || err.message?.includes('timeout')) {
        reject(new Error('AI service timeout'));
      } else {
        reject(err);
      }
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('AI service timeout'));
    }, TIMEOUT_MS);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('AI service timeout'));
    });
    req.write(bodyStr);
    req.end();
  });
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
