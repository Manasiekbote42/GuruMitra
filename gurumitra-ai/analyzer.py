"""
GuruMitra analyzer: audio metrics + speech-to-text (Whisper) + teaching-content analysis.
Deterministic, no randomness. Same video -> same transcript -> same feedback.
Uses ffmpeg for audio extraction. Set FFMPEG_PATH to full path to ffmpeg.exe if not on PATH.
"""
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Optional

# Load .env from this package dir so FFMPEG_PATH is set when running from Cursor/IDE
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.is_file():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except Exception:
        pass

import requests
import numpy as np
from pydub import AudioSegment

# Whisper model loaded once at first use (lazy)
_whisper_model = None
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")

def _find_ffmpeg():
    out = os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg")
    if out:
        return out
    # Windows: try common WinGet/ffmpeg location
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA") or os.path.expandvars("%LOCALAPPDATA%")
        if local and os.path.isdir(local):
            base = os.path.join(local, "Microsoft", "WinGet", "Packages")
            if os.path.isdir(base):
                for name in os.listdir(base):
                    if "ffmpeg" in name.lower() or "Gyan" in name:
                        p = os.path.join(base, name)
                        if os.path.isdir(p):
                            for sub in os.listdir(p):
                                bin_dir = os.path.join(p, sub, "bin")
                                exe = os.path.join(bin_dir, "ffmpeg.exe")
                                if os.path.isfile(exe):
                                    return exe
    return None


_ffmpeg = _find_ffmpeg()
if _ffmpeg:
    AudioSegment.converter = _ffmpeg
    _ffprobe = os.environ.get("FFPROBE_PATH") or shutil.which("ffprobe")
    if _ffprobe:
        AudioSegment.ffprobe = _ffprobe
    elif os.path.isfile(os.path.join(os.path.dirname(_ffmpeg), "ffprobe.exe")):
        AudioSegment.ffprobe = os.path.join(os.path.dirname(_ffmpeg), "ffprobe.exe")
    elif os.path.isfile(os.path.join(os.path.dirname(_ffmpeg), "ffprobe")):
        AudioSegment.ffprobe = os.path.join(os.path.dirname(_ffmpeg), "ffprobe")


def _is_youtube_url(url: str) -> bool:
    u = (url or "").strip().lower()
    return "youtube.com/watch" in u or "youtu.be/" in u or "youtube.com/shorts/" in u


def download_video(url: str, timeout: int = 60) -> str:
    """Download video from direct URL to a temporary file. Returns path."""
    resp = requests.get(url, timeout=timeout, stream=True)
    resp.raise_for_status()
    ext = Path(url.split("?")[0]).suffix or ".mp4"
    fd, path = tempfile.mkstemp(suffix=ext)
    try:
        with os.fdopen(fd, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return path
    except Exception:
        os.unlink(path)
        raise


def download_youtube(url: str, timeout: int = 600) -> str:
    """Download YouTube (or youtu.be) video via yt-dlp to a temp file. Returns path. Requires yt-dlp and ffmpeg."""
    import subprocess
    tmpdir = tempfile.mkdtemp()
    out_template = os.path.join(tmpdir, "video.%(ext)s")
    try:
        # Let yt-dlp choose filename by extension; use temp dir so we can find the file
        result = subprocess.run(
            [
                shutil.which("yt-dlp") or "yt-dlp",
                "-f", "best[ext=mp4]/best[ext=m4a]/best",
                "--no-playlist",
                "--no-warnings",
                "-o", out_template,
                "--socket-timeout", "30",
                "--restrict-filenames",
                url.strip(),
            ],
            timeout=timeout,
            capture_output=True,
            text=True,
        )
        # yt-dlp may output video.mp4, video.m4a, etc.
        candidates = [
            os.path.join(tmpdir, f)
            for f in os.listdir(tmpdir)
            if os.path.isfile(os.path.join(tmpdir, f)) and not f.endswith(".part")
        ]
        if not candidates:
            err = (result.stderr or result.stdout or "")[:400] if result.returncode else ""
            try:
                for f in os.listdir(tmpdir):
                    os.unlink(os.path.join(tmpdir, f))
                os.rmdir(tmpdir)
            except Exception:
                pass
            raise RuntimeError("yt-dlp did not produce a valid file" + (f": {err}" if err else ""))
        if result.returncode != 0:
            try:
                for f in os.listdir(tmpdir):
                    os.unlink(os.path.join(tmpdir, f))
                os.rmdir(tmpdir)
            except Exception:
                pass
            err = (result.stderr or result.stdout or str(result))[:400]
            raise RuntimeError(f"YouTube download failed: {err}")
        path = candidates[0]
        if os.path.getsize(path) == 0:
            raise RuntimeError("yt-dlp produced an empty file")
        # Move to a single temp file so caller can unlink one path; avoid leaving dir behind
        fd, final_path = tempfile.mkstemp(suffix=os.path.splitext(path)[1] or ".mp4")
        os.close(fd)
        try:
            shutil.move(path, final_path)
        except Exception:
            try:
                os.unlink(final_path)
            except Exception:
                pass
            raise
        # Remove temp dir (any remaining files)
        try:
            for f in os.listdir(tmpdir):
                p = os.path.join(tmpdir, f)
                if os.path.isfile(p):
                    os.unlink(p)
            os.rmdir(tmpdir)
        except Exception:
            pass
        return final_path
    except subprocess.TimeoutExpired:
        try:
            for f in os.listdir(tmpdir):
                os.unlink(os.path.join(tmpdir, f))
            os.rmdir(tmpdir)
        except Exception:
            pass
        raise RuntimeError("YouTube download timed out")
    except subprocess.CalledProcessError as e:
        try:
            for f in os.listdir(tmpdir):
                os.unlink(os.path.join(tmpdir, f))
            os.rmdir(tmpdir)
        except Exception:
            pass
        err = (e.stderr or e.stdout or str(e))[:500]
        raise RuntimeError(f"YouTube download failed: {err}")
    except Exception:
        try:
            for f in os.listdir(tmpdir):
                os.unlink(os.path.join(tmpdir, f))
            os.rmdir(tmpdir)
        except Exception:
            pass
        raise


def download_video_or_youtube(url: str, timeout_direct: int = 60, timeout_youtube: int = 600) -> str:
    """Download from URL: use yt-dlp for YouTube, else direct HTTP. Returns local file path."""
    u = (url or "").strip()
    if not u:
        raise ValueError("video_url is required")
    if _is_youtube_url(u):
        return download_youtube(u, timeout=timeout_youtube)
    return download_video(u, timeout=timeout_direct)


def extract_audio(video_path: str) -> AudioSegment:
    """Extract audio track from video file. Requires ffmpeg."""
    # Ensure converter is set at runtime (in case PATH wasn't set in this process)
    ffmpeg = os.environ.get("FFMPEG_PATH") or _find_ffmpeg()
    if ffmpeg and os.path.isfile(ffmpeg):
        AudioSegment.converter = ffmpeg
        bin_dir = os.path.dirname(ffmpeg)
        for name in ("ffprobe.exe", "ffprobe"):
            p = os.path.join(bin_dir, name)
            if os.path.isfile(p):
                AudioSegment.ffprobe = p
                break
    return AudioSegment.from_file(video_path)


def _export_audio_to_temp(audio: AudioSegment) -> str:
    """Export AudioSegment to a temporary WAV file. Returns path. Caller must unlink."""
    fd, path = tempfile.mkstemp(suffix=".wav")
    try:
        audio.export(path, format="wav")
        return path
    except Exception:
        try:
            os.unlink(path)
        except Exception:
            pass
        raise


def _get_whisper_model():
    """Load Whisper model once at first use."""
    global _whisper_model
    if _whisper_model is None:
        import whisper
        _whisper_model = whisper.load_model(WHISPER_MODEL_NAME)
    return _whisper_model


def transcribe_audio(audio_path: str) -> dict:
    """
    Speech-to-text using local Whisper. Deterministic for same audio.
    Returns: {"transcript": str, "segments": [{"start": float, "end": float, "text": str}, ...]}
    """
    model = _get_whisper_model()
    result = model.transcribe(audio_path, fp16=False, language=None)
    transcript = (result.get("text") or "").strip()
    segments_raw = result.get("segments") or []
    segments = []
    for seg in segments_raw:
        start = float(seg.get("start", 0))
        end = float(seg.get("end", 0))
        text = (seg.get("text") or "").strip()
        segments.append({"start": round(start, 2), "end": round(end, 2), "text": text})
    return {"transcript": transcript, "segments": segments}


def analyze_teaching_content(transcript: str, duration_seconds: float) -> dict:
    """
    Deterministic teaching-content analysis from transcript.
    Detects questions, examples, structure words; computes interaction frequency.
    Returns: question_count, example_count, structure_score, interaction_score.
    """
    text = (transcript or "").strip().lower()
    if not text:
        return {
            "question_count": 0,
            "example_count": 0,
            "structure_score": 0.0,
            "interaction_score": 0.0,
        }
    # Question detection: "?" count + question words (deterministic)
    question_count = text.count("?")
    question_words = re.findall(
        r"\b(what|how|why|when|where|which|who)\b|^\s*(is|are|do|does|did|can|could|would|should)\b",
        text,
        re.IGNORECASE | re.MULTILINE,
    )
    question_count += len(question_words)
    # Examples
    example_phrases = ["for example", "for instance", "imagine", "such as", "e.g.", "like when"]
    example_count = sum(text.count(p) for p in example_phrases)
    # Structure: first, next, then, finally, firstly, secondly
    structure_phrases = ["first", "next", "then", "finally", "firstly", "secondly", "lastly", "in conclusion"]
    structure_count = sum(text.count(p) for p in structure_phrases)
    # Normalize to 0-5 scale (deterministic caps)
    word_count = max(1, len(text.split()))
    duration_min = max(0.1, duration_seconds / 60.0)
    structure_score = round(min(5.0, 1.0 + (structure_count / max(1, word_count / 50)) * 2), 1)
    questions_per_min = question_count / duration_min
    interaction_score = round(min(5.0, 1.0 + questions_per_min * 0.5), 1)
    return {
        "question_count": question_count,
        "example_count": example_count,
        "structure_score": structure_score,
        "interaction_score": interaction_score,
    }


# Stopwords for key-phrase extraction (deterministic)
_STOP = frozenset(
    "a an the and or but in on at to for of with by from as is was are were been be have has had do does did will would could should may might must can this that these those it its i you we they".split()
)


def _segment_has_question(text: str) -> bool:
    t = (text or "").strip()
    if "?" in t:
        return True
    t_lower = t.lower()
    q_start = re.match(r"^\s*(what|how|why|when|where|which|who|is|are|do|does|did|can|could|would|should)\b", t_lower)
    return bool(q_start)


def _segment_has_example(text: str) -> bool:
    t = (text or "").lower()
    return any(p in t for p in ["for example", "for instance", "such as", "e.g.", "imagine", "like when"])


def _segment_has_structure(text: str) -> bool:
    t = (text or "").lower()
    return any(p in t for p in ["first", "next", "then", "finally", "firstly", "secondly", "lastly", "in conclusion"])


def analyze_segments(segments: list) -> list:
    """
    Analyze every segment from Whisper: questions, examples, structure, word count.
    Returns list of dicts with start, end, text, has_question, has_example, has_structure, word_count.
    """
    out = []
    for seg in segments or []:
        start = float(seg.get("start", 0))
        end = float(seg.get("end", 0))
        text = (seg.get("text") or "").strip()
        words = text.split()
        out.append({
            "start": round(start, 1),
            "end": round(end, 1),
            "text": text,
            "has_question": _segment_has_question(text),
            "has_example": _segment_has_example(text),
            "has_structure": _segment_has_structure(text),
            "word_count": len(words),
        })
    return out


def analyze_content_by_parts(transcript: str, segments: list, duration_seconds: float) -> dict:
    """
    Split video into opening (first 20%), middle (60%), closing (20%).
    For each part: question_count, example_count, word_count, segment_count.
    Enables feedback like "In the opening you asked X questions; the middle had none."
    """
    if not segments and not (transcript or "").strip():
        return {"opening": {}, "middle": {}, "closing": {}}
    duration = max(0.1, duration_seconds)
    t_end = duration
    opening_end = t_end * 0.2
    closing_start = t_end * 0.8
    parts = {"opening": [], "middle": [], "closing": []}
    for seg in segments or []:
        start = float(seg.get("start", 0))
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        has_q = _segment_has_question(text)
        has_ex = _segment_has_example(text)
        wc = len(text.split())
        entry = {"start": start, "text": text[:80], "has_question": has_q, "has_example": has_ex, "word_count": wc}
        if start < opening_end:
            parts["opening"].append(entry)
        elif start >= closing_start:
            parts["closing"].append(entry)
        else:
            parts["middle"].append(entry)
    def agg(entries):
        return {
            "question_count": sum(1 for e in entries if e.get("has_question")),
            "example_count": sum(1 for e in entries if e.get("has_example")),
            "word_count": sum(e.get("word_count", 0) for e in entries),
            "segment_count": len(entries),
        }
    return {
        "opening": agg(parts["opening"]),
        "middle": agg(parts["middle"]),
        "closing": agg(parts["closing"]),
    }


def extract_key_phrases(transcript: str, max_phrases: int = 8) -> list:
    """
    Extract significant repeated words from transcript (deterministic).
    Skips short words and stopwords. Used to make feedback content-specific.
    """
    text = (transcript or "").lower()
    words = re.findall(r"[a-z0-9]+", text)
    counts = {}
    for w in words:
        if len(w) >= 4 and w not in _STOP:
            counts[w] = counts.get(w, 0) + 1
    sorted_words = sorted(counts.items(), key=lambda x: (-x[1], x[0]))[: max_phrases * 2]
    return [w for w, _ in sorted_words[:max_phrases]]


def compute_metrics(audio: AudioSegment) -> dict:
    """
    Compute duration, speaking time %, silence %, and audio energy from audio.
    Uses energy-based voice activity: chunks above threshold count as speech.
    Deterministic: same audio -> same metrics.
    """
    duration_ms = len(audio)
    duration_seconds = duration_ms / 1000.0

    samples = np.array(audio.get_array_of_samples())
    if audio.channels == 2:
        samples = samples.reshape(-1, 2).mean(axis=1)
    samples = samples.astype(np.float64) / (2 ** 15)

    # 100ms windows
    sample_rate = audio.frame_rate
    window_samples = int(0.1 * sample_rate)
    n_windows = len(samples) // window_samples
    if n_windows == 0:
        return {
            "duration_seconds": duration_seconds,
            "speech_ratio": 0.5,
            "silence_ratio": 0.5,
            "audio_energy": 0.3,
        }

    energies = []
    for i in range(n_windows):
        chunk = samples[i * window_samples : (i + 1) * window_samples]
        rms = np.sqrt(np.mean(chunk ** 2))
        energies.append(rms)

    energies = np.array(energies)
    threshold = max(energies.max() * 0.05, 1e-6)
    speech_windows = np.sum(energies >= threshold)
    speech_ratio = float(speech_windows / n_windows)
    silence_ratio = 1.0 - speech_ratio
    audio_energy = float(np.clip(np.mean(energies) / (threshold * 10 + 1e-6), 0, 1))

    return {
        "duration_seconds": round(duration_seconds, 2),
        "speech_ratio": round(speech_ratio, 4),
        "silence_ratio": round(silence_ratio, 4),
        "audio_energy": round(min(audio_energy, 1.0), 4),
    }


# Stable thresholds for 100% repeatable feedback (same metrics -> same output)
THRESHOLD_SPEECH_LOW = 0.25
THRESHOLD_SPEECH_MID = 0.45
THRESHOLD_SPEECH_HIGH = 0.70
THRESHOLD_SPEECH_STRENGTH = 0.35
THRESHOLD_SPEECH_IMPROVE = 0.4
THRESHOLD_SPEECH_REC = 0.5
THRESHOLD_ENERGY_LOW = 0.3
THRESHOLD_ENERGY_MID = 0.5
THRESHOLD_ENERGY_IMPROVE = 0.4
THRESHOLD_ENERGY_REC = 0.5
THRESHOLD_SCORE_STRENGTH_PEDAGOGY = 4.0
THRESHOLD_SCORE_STRENGTH_ENGAGEMENT = 3.5
THRESHOLD_SCORE_STRENGTH_DELIVERY = 3.5
THRESHOLD_SCORE_SUMMARY = 3.5
THRESHOLD_DURATION_STRENGTH_MIN = 15.0  # minutes
THRESHOLD_DURATION_IMPROVE_MIN = 10.0   # minutes
SCORE_DECIMALS = 1

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")


def _generate_feedback_with_gemini(
    metrics: dict,
    content_insights: Optional[dict],
    transcript: str,
    segment_insights: Optional[list],
    content_by_parts: Optional[dict],
    key_phrases: Optional[list],
) -> Optional[dict]:
    """
    Call Google Gemini API to generate teaching feedback. Returns same shape as generate_feedback
    or None on failure (caller should fall back to rule-based feedback).
    Requires GEMINI_API_KEY. Optional: GEMINI_MODEL (default gemini-2.0-flash).
    """
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        from google import genai
    except ImportError:
        return None

    duration_min = float(metrics.get("duration_seconds", 0)) / 60.0
    speech_ratio = float(metrics.get("speech_ratio", 0.5))
    energy = float(metrics.get("audio_energy", 0.5))
    q_count = (content_insights or {}).get("question_count", 0)
    ex_count = (content_insights or {}).get("example_count", 0)
    parts = content_by_parts or {}
    transcript_excerpt = (transcript or "").strip()[:3000]
    phrases = key_phrases or []

    prompt = f"""You are an expert teaching coach. Based on the following classroom session data, produce feedback in the exact JSON format below. No other text.

Session data:
- Duration: {duration_min:.1f} minutes
- Speech ratio (fraction of time with speech): {speech_ratio:.2f}
- Audio energy (0-1): {energy:.2f}
- Questions detected: {q_count}
- Examples/illustrations detected: {ex_count}
- Key phrases from transcript: {phrases[:8]}
- Opening (first 20%): questions={parts.get('opening', {}).get('question_count', 0)}, examples={parts.get('opening', {}).get('example_count', 0)}
- Middle (60%): questions={parts.get('middle', {}).get('question_count', 0)}, examples={parts.get('middle', {}).get('example_count', 0)}
- Closing (last 20%): questions={parts.get('closing', {}).get('question_count', 0)}, examples={parts.get('closing', {}).get('example_count', 0)}

Transcript excerpt:
{transcript_excerpt or "(no transcript)"}

Respond with a single JSON object only (no markdown, no code block), with these exact keys:
- pedagogy_score: number 1-5 (teaching clarity, structure, explanation)
- engagement_score: number 1-5 (interaction, questions, student engagement)
- delivery_score: number 1-5 (speaking time, pacing, audio quality)
- curriculum_score: number 1-5 (overall alignment and coverage)
- feedback: string (one short summary sentence for the teacher)
- strengths: array of strings (2-5 specific strengths from this session)
- improvements: array of strings (2-5 specific areas to improve)
- recommendations: array of strings (2-4 actionable next steps)
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        text = (response.text or "").strip()
        if not text:
            return None
        # Strip markdown code block if present
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)
        data = json.loads(text)
        # Validate and normalize
        def clamp_score(v):
            try:
                return round(min(5.0, max(0.0, float(v))), SCORE_DECIMALS)
            except (TypeError, ValueError):
                return 3.5
        pedagogy_score = clamp_score(data.get("pedagogy_score"))
        engagement_score = clamp_score(data.get("engagement_score"))
        delivery_score = clamp_score(data.get("delivery_score"))
        curriculum_score = clamp_score(data.get("curriculum_score"))
        feedback_str = str(data.get("feedback") or "Session reviewed.").strip() or "Session reviewed."
        strengths = [str(s).strip() for s in (data.get("strengths") or []) if str(s).strip()][:10]
        improvements = [str(s).strip() for s in (data.get("improvements") or []) if str(s).strip()][:10]
        recommendations = [str(s).strip() for s in (data.get("recommendations") or []) if str(s).strip()][:8]
        if not strengths:
            strengths = ["Session recorded and reviewed."]
        if not improvements:
            improvements = ["Consider one focus area from recommendations."]
        if not recommendations:
            recommendations = ["Review this feedback and focus on one improvement in your next video."]
        return {
            "pedagogy_score": pedagogy_score,
            "engagement_score": engagement_score,
            "delivery_score": delivery_score,
            "curriculum_score": curriculum_score,
            "feedback": feedback_str,
            "strengths": strengths,
            "improvements": improvements,
            "recommendations": recommendations,
            "metrics": metrics,
        }
    except Exception:
        return None


def generate_feedback(
    metrics: dict,
    content_insights: Optional[dict] = None,
    transcript: str = "",
    segment_insights: Optional[list] = None,
    content_by_parts: Optional[dict] = None,
    key_phrases: Optional[list] = None,
) -> dict:
    """
    Deterministic feedback from audio metrics and full content/segment analysis.
    Every strength, improvement, and recommendation is derived from this video's data
    (transcript, segments, parts, key phrases) so feedback is unique per video.
    """
    duration = float(metrics["duration_seconds"])
    speech_ratio = float(metrics["speech_ratio"])
    energy = float(metrics["audio_energy"])
    duration_min = duration / 60.0
    total_words = len((transcript or "").split())
    q_count = (content_insights or {}).get("question_count", 0)
    ex_count = (content_insights or {}).get("example_count", 0)
    parts = content_by_parts or {}
    opening = parts.get("opening") or {}
    middle = parts.get("middle") or {}
    closing = parts.get("closing") or {}
    phrases = key_phrases or []

    # ---- Audio-only scores (unchanged logic) ----
    if speech_ratio < THRESHOLD_SPEECH_LOW:
        pedagogy_audio_raw = 2.0 + speech_ratio * 4
        pedagogy_feedback = "Low speaking time ({:.0%} speech). Consider more direct explanation.".format(speech_ratio)
    elif speech_ratio < THRESHOLD_SPEECH_MID:
        pedagogy_audio_raw = 3.0 + (speech_ratio - THRESHOLD_SPEECH_LOW)
        pedagogy_feedback = "Moderate speaking time ({:.0%}). Balance explanation with pauses for student thinking.".format(speech_ratio)
    elif speech_ratio < THRESHOLD_SPEECH_HIGH:
        pedagogy_audio_raw = 3.8 + (speech_ratio - THRESHOLD_SPEECH_MID) * 2
        pedagogy_feedback = "Clear explanation with good pacing ({:.0%} speech).".format(speech_ratio)
    else:
        pedagogy_audio_raw = 4.5 + min(0.5, (speech_ratio - THRESHOLD_SPEECH_HIGH) * 2)
        pedagogy_feedback = "Strong verbal presence and consistent explanation throughout ({:.0%} speech).".format(speech_ratio)
    pedagogy_audio = round(min(5.0, pedagogy_audio_raw), SCORE_DECIMALS)

    engagement_audio_raw = 2.5 + energy * 2.0 + min(0.5, duration_min / 60)
    engagement_audio = round(min(5.0, engagement_audio_raw), SCORE_DECIMALS)
    if energy < THRESHOLD_ENERGY_LOW:
        engagement_feedback = "Audio levels were low in this recording. Check microphone placement for clearer capture."
    elif energy < THRESHOLD_ENERGY_MID:
        engagement_feedback = "Moderate vocal energy in this session. Vary tone to maintain student attention."
    else:
        engagement_feedback = "Good vocal energy and audible delivery in this video."

    delivery_score_raw = 2.5 + speech_ratio * 2.2 + min(0.3, energy)
    delivery_score = round(min(5.0, delivery_score_raw), SCORE_DECIMALS)
    if speech_ratio < THRESHOLD_SPEECH_STRENGTH:
        delivery_feedback = "Increase speaking time relative to silence for clearer delivery (current speech ratio {:.0%}).".format(speech_ratio)
    else:
        delivery_feedback = "Effective use of speaking time and presence in this session."

    # ---- Merge with content when available ----
    if content_insights:
        structure = float(content_insights.get("structure_score", 0))
        interaction = float(content_insights.get("interaction_score", 0))
        pedagogy_score = round((pedagogy_audio + structure) / 2.0, SCORE_DECIMALS)
        pedagogy_score = round(min(5.0, pedagogy_score), SCORE_DECIMALS)
        engagement_score = round((engagement_audio + interaction) / 2.0, SCORE_DECIMALS)
        engagement_score = round(min(5.0, engagement_score), SCORE_DECIMALS)
    else:
        pedagogy_score = pedagogy_audio
        engagement_score = engagement_audio

    curriculum_score = round((pedagogy_score + engagement_score + delivery_score) / 3, SCORE_DECIMALS)
    curriculum_score = round(min(5.0, curriculum_score), SCORE_DECIMALS)

    # ---- Strengths: content-unique, from this video's data ----
    strengths = []
    if pedagogy_score >= THRESHOLD_SCORE_STRENGTH_PEDAGOGY:
        strengths.append(pedagogy_feedback)
    if engagement_score >= THRESHOLD_SCORE_STRENGTH_ENGAGEMENT:
        strengths.append(engagement_feedback)
    if delivery_score >= THRESHOLD_SCORE_STRENGTH_DELIVERY:
        strengths.append(delivery_feedback)
    if duration_min >= THRESHOLD_DURATION_STRENGTH_MIN:
        strengths.append("Good session length ({:.1f} min) for meaningful assessment.".format(duration_min))
    if q_count >= 2:
        strengths.append("You asked {} questions in this video—supports interaction and check for understanding.".format(q_count))
    if ex_count >= 1:
        strengths.append("You used {} example(s) or illustration(s) in your explanation.".format(ex_count))
    if segment_insights:
        q_segments = [s for s in segment_insights if s.get("has_question")]
        if len(q_segments) >= 1 and q_segments[0].get("start") is not None:
            strengths.append("First question appears around {:.0f}s—good early check-in.".format(q_segments[0]["start"]))
    if opening.get("segment_count", 0) > 0:
        oq, oex = opening.get("question_count", 0), opening.get("example_count", 0)
        if oq >= 1 or oex >= 1:
            strengths.append("In the opening (first 20%): {} question(s), {} example(s)—clear start.".format(oq, oex))
    if phrases:
        strengths.append("Your explanation touched on: {}.".format(", ".join(phrases[:5])))
    if not strengths:
        strengths.append("Session recorded ({} words, {:.1f} min). Review metrics to identify focus areas.".format(total_words, duration_min))

    # ---- Improvements: content-unique, from this video ----
    improvements = []
    if speech_ratio < THRESHOLD_SPEECH_IMPROVE:
        improvements.append("This video had {:.0%} speaking time; consider more explanation and direct instruction.".format(speech_ratio))
    if energy < THRESHOLD_ENERGY_IMPROVE:
        improvements.append("Improve audio capture or vocal projection in future recordings for better analysis.")
    if duration_min < THRESHOLD_DURATION_IMPROVE_MIN:
        improvements.append("This session was {:.1f} min; longer sessions (12+ min) allow richer feedback.".format(duration_min))
    if q_count < 1:
        improvements.append("No questions detected in this video. Add 1–2 questions to check understanding and encourage participation.")
    elif q_count == 1:
        improvements.append("Only one question in this video. Adding 2–3 check-in questions would strengthen engagement.")
    if ex_count < 1:
        improvements.append("No examples or concrete illustrations detected. Include at least one example to clarify concepts.")
    # Part-specific: middle often needs more interaction
    mid_q = middle.get("question_count", 0)
    mid_ex = middle.get("example_count", 0)
    if (middle.get("segment_count", 0) > 3 and mid_q == 0 and q_count > 0):
        improvements.append("The middle section of your video had no questions; consider adding a check-in there.")
    if middle.get("segment_count", 0) > 5 and mid_ex == 0 and ex_count > 0:
        improvements.append("The middle section had no examples; an example there could reinforce the main idea.")
    if not improvements:
        improvements.append("Maintain current balance; consider small refinements from recommendations below.")

    # ---- Recommendations: specific to this video ----
    recommendations = []
    if speech_ratio < THRESHOLD_SPEECH_REC:
        recommendations.append("Practice maintaining consistent speech for 2–3 minute stretches in your next session.")
    if energy < THRESHOLD_ENERGY_REC:
        recommendations.append("Check audio levels before recording; aim for clear capture next time.")
    if q_count < 2:
        recommendations.append("Plan 2–3 check-in questions in your next session to gauge understanding.")
    if ex_count < 1:
        recommendations.append("Include at least one concrete example or illustration in your next explanation.")
    if phrases:
        recommendations.append("In your next session, consider reinforcing the link between key ideas you covered (e.g. {}).".format(", ".join(phrases[:3])))
    recommendations.append("Review this feedback and focus on one improvement area in your next video.")

    summary = (
        pedagogy_feedback
        if pedagogy_score >= THRESHOLD_SCORE_SUMMARY
        else (improvements[0] if improvements else "Review metrics below.")
    )
    if content_insights and (q_count or ex_count):
        summary = "This {:.1f} min session had {} question(s) and {} example(s). ".format(duration_min, q_count, ex_count) + summary

    return {
        "pedagogy_score": pedagogy_score,
        "engagement_score": engagement_score,
        "delivery_score": delivery_score,
        "curriculum_score": curriculum_score,
        "feedback": summary,
        "strengths": strengths,
        "improvements": improvements,
        "recommendations": recommendations,
        "metrics": metrics,
    }


def build_session_output(
    session_id: Optional[str],
    transcript_summary: str,
    scores: dict,
    strengths: list,
    improvements: list,
    recommendations: list,
    metrics_audio: dict,
    metrics_content: Optional[dict],
) -> dict:
    """Session-level JSON output. Backend can pass session_id; scores/suggestions are from generate_feedback."""
    return {
        "session_id": session_id,
        "transcript_summary": transcript_summary,
        "pedagogy_score": scores.get("pedagogy_score"),
        "engagement_score": scores.get("engagement_score"),
        "delivery_score": scores.get("delivery_score"),
        "curriculum_score": scores.get("curriculum_score"),
        "feedback": scores.get("feedback"),
        "scores": scores,
        "strengths": strengths,
        "improvements": improvements,
        "recommendations": recommendations,
        "metrics": {
            "audio": metrics_audio,
            "content": metrics_content or {},
        },
    }


def run_analysis(video_path: str, session_id: Optional[str] = None) -> dict:
    """
    Full Phase-2 pipeline: extract audio -> transcribe (Whisper) -> audio metrics -> teaching content -> merged feedback.
    If transcript is empty, returns warning and no scores (no fake feedback).
    Same video -> same transcript -> same feedback. JSON only.
    """
    audio = extract_audio(video_path)
    metrics_audio = compute_metrics(audio)
    duration_seconds = float(metrics_audio.get("duration_seconds", 0))

    audio_temp_path = None
    try:
        audio_temp_path = _export_audio_to_temp(audio)
        trans = transcribe_audio(audio_temp_path)
    finally:
        if audio_temp_path and os.path.isfile(audio_temp_path):
            try:
                os.unlink(audio_temp_path)
            except Exception:
                pass

    transcript = (trans.get("transcript") or "").strip()
    segments = trans.get("segments") or []

    if not transcript:
        return {
            "warning": "Empty transcript. No scores generated.",
            "session_id": session_id,
            "transcript_summary": "",
            "scores": None,
            "pedagogy_score": None,
            "engagement_score": None,
            "delivery_score": None,
            "curriculum_score": None,
            "feedback": None,
            "strengths": [],
            "improvements": [],
            "recommendations": [],
            "metrics": {"audio": metrics_audio, "content": {}},
            "semantic_feedback": None,
        }
    transcript_summary = transcript[:500] + ("..." if len(transcript) > 500 else "")

    content_insights = analyze_teaching_content(transcript, duration_seconds)
    segment_insights = analyze_segments(segments)
    content_by_parts = analyze_content_by_parts(transcript, segments, duration_seconds)
    key_phrases = extract_key_phrases(transcript)

    # Use Gemini for feedback when GEMINI_API_KEY is set; otherwise rule-based
    feedback_result = _generate_feedback_with_gemini(
        metrics_audio,
        content_insights,
        transcript,
        segment_insights,
        content_by_parts,
        key_phrases,
    )
    if feedback_result is None:
        feedback_result = generate_feedback(
            metrics_audio,
            content_insights=content_insights,
            transcript=transcript,
            segment_insights=segment_insights,
            content_by_parts=content_by_parts,
            key_phrases=key_phrases,
        )
    scores = {
        "pedagogy_score": feedback_result["pedagogy_score"],
        "engagement_score": feedback_result["engagement_score"],
        "delivery_score": feedback_result["delivery_score"],
        "curriculum_score": feedback_result["curriculum_score"],
        "feedback": feedback_result["feedback"],
    }
    metrics_content = dict(content_insights)
    metrics_content["by_parts"] = content_by_parts
    metrics_content["segment_count"] = len(segment_insights)
    metrics_content["key_phrases"] = key_phrases

    # Phase 4: semantic evaluation (LLM) for explainable, audit-safe feedback. Same input -> same output (temperature=0).
    semantic_feedback = None
    try:
        from ai_evaluator import evaluate_teaching_semantics
        eval_input = {
            "transcript": transcript,
            "segments": [{"start": s.get("start"), "end": s.get("end"), "text": (s.get("text") or "").strip()} for s in segments],
            "metrics_audio": metrics_audio,
            "metrics_content": {
                "question_count": content_insights.get("question_count", 0),
                "example_count": content_insights.get("example_count", 0),
                "structure_score": content_insights.get("structure_score", 0),
                "interaction_score": content_insights.get("interaction_score", 0),
            },
            "duration_minutes": duration_seconds / 60.0,
        }
        semantic_feedback = evaluate_teaching_semantics(eval_input)
    except Exception:
        semantic_feedback = {
            "semantic_strengths": [],
            "semantic_improvements": [],
            "session_summary": "",
            "reasoning_notes": "",
        }

    out = build_session_output(
        session_id=session_id,
        transcript_summary=transcript_summary,
        scores=scores,
        strengths=feedback_result["strengths"],
        improvements=feedback_result["improvements"],
        recommendations=feedback_result["recommendations"],
        metrics_audio=metrics_audio,
        metrics_content=metrics_content,
    )
    out["semantic_feedback"] = semantic_feedback
    return out
