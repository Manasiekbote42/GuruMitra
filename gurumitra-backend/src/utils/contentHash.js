import crypto from 'crypto';

/**
 * Generate a unique, deterministic hash for uploaded video content.
 * Same video_url + same extracted features always produce the same hash.
 * Used to reuse stored AI feedback when the same video is uploaded again.
 * @param {string} videoUrl - Normalized URL or empty string
 * @param {object} metadata - optional { duration_seconds, speech_ratio, audio_energy }
 * @returns {string} hex SHA-256 hash (64 chars)
 */
export function computeContentHash(videoUrl, metadata = {}) {
  const url = (videoUrl || '').trim();
  const canonical = {
    video_url: url,
    duration_seconds: metadata.duration_seconds != null ? Number(metadata.duration_seconds) : null,
    speech_ratio: metadata.speech_ratio != null ? Number(metadata.speech_ratio) : null,
    audio_energy: metadata.audio_energy != null ? Number(metadata.audio_energy) : null,
  };
  const str = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Hash file buffer for duplicate detection (same file → same hash → reuse feedback).
 * @param {Buffer} buffer - Raw file bytes
 * @returns {string} hex SHA-256 hash (64 chars)
 */
export function computeFileHash(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
