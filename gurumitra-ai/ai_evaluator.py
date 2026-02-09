"""
GuruMitra Phase 4: Semantic teaching evaluator.
Uses LLM (Gemini) ONLY for semantic evaluation. No randomness (temperature=0).
Same transcript + same metrics = same semantic feedback.
All feedback must reference transcript phrase or provided metric (audit-safe).
"""
import json
import os
from typing import Any, Optional

# Optional: load .env for GEMINI_API_KEY
from pathlib import Path
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.is_file():
    try:
        from dotenv import load_dotenv
        load_dotenv(str(_env_path))
    except Exception:
        pass

SYSTEM_PROMPT = """You are an expert classroom evaluator for schools.
Evaluate teaching quality strictly from the provided transcript and metrics.
Do NOT assume student emotions or learning outcomes.
Do NOT modify numeric scores.
Every strength or improvement MUST reference:
- a transcript phrase OR
- a provided metric.
Your output must be professional, neutral, and audit-safe."""

USER_PROMPT_TEMPLATE = """Based on the following session data, provide structured feedback.

Session metrics:
- Duration: {duration_minutes:.2f} minutes
- Speech ratio: {speech_ratio:.2f}
- Audio energy: {audio_energy:.2f}
- Questions detected: {question_count}
- Examples detected: {example_count}
- Structure score (0-5): {structure_score}
- Interaction score (0-5): {interaction_score}

Transcript (excerpt, max 4000 chars):
---
{transcript_excerpt}
---

Provide your response as a single JSON object only (no markdown, no code fence). Use exactly these keys:
- "semantic_strengths": array of objects, each with "point" (string) and "evidence" (string). Max 5 items. Evidence must quote transcript or cite a metric.
- "semantic_improvements": array of objects, each with "point" (string) and "evidence" (string). Max 5 items. Evidence must quote transcript or cite a metric.
- "session_summary": string, 2-3 lines summarizing the session.
- "reasoning_notes": string, short pedagogical reasoning using transcript evidence.

Output only the JSON object, nothing else."""

REQUIRED_KEYS = ("semantic_strengths", "semantic_improvements", "session_summary", "reasoning_notes")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")


def _call_gemini(prompt_user: str) -> Optional[str]:
    """Call Gemini with system + user prompt. Temperature=0. Returns response text or None."""
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        from google import genai
    except ImportError:
        return None
    try:
        client = genai.Client(api_key=api_key)
        # Combine system + user for single turn (no randomness)
        full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt_user}"
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=full_prompt,
            config={"temperature": 0.0},
        )
        return (response.text or "").strip()
    except Exception:
        return None


def _parse_and_validate(text: str) -> Optional[dict]:
    """Parse JSON and validate required keys and structure. Return dict or None."""
    if not text:
        return None
    raw = text
    if raw.startswith("```"):
        lines = raw.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    for key in REQUIRED_KEYS:
        if key not in data:
            return None
    # Normalize semantic_strengths and semantic_improvements to list of {point, evidence}
    def norm_items(items: Any, max_n: int) -> list:
        if not isinstance(items, list):
            return []
        out = []
        for i, x in enumerate(items):
            if i >= max_n:
                break
            if isinstance(x, dict):
                point = str(x.get("point") or "").strip()
                evidence = str(x.get("evidence") or "").strip()
                if point:
                    out.append({"point": point, "evidence": evidence})
            elif isinstance(x, str) and x.strip():
                out.append({"point": x.strip(), "evidence": ""})
        return out

    data["semantic_strengths"] = norm_items(data.get("semantic_strengths"), 5)
    data["semantic_improvements"] = norm_items(data.get("semantic_improvements"), 5)
    data["session_summary"] = str(data.get("session_summary") or "").strip() or "Session evaluated."
    data["reasoning_notes"] = str(data.get("reasoning_notes") or "").strip()
    return data


def evaluate_teaching_semantics(input_data: dict) -> dict:
    """
    Run LLM semantic evaluation on transcript + metrics.
    Input: transcript, segments, metrics_audio, metrics_content, duration_minutes.
    Output: { semantic_strengths, semantic_improvements, session_summary, reasoning_notes }
    Rejects output if format mismatches; returns empty structure on failure (caller can keep rule-based only).
    Deterministic: same input -> same prompt -> temperature 0 -> same output.
    """
    transcript = (input_data.get("transcript") or "").strip()
    metrics_audio = input_data.get("metrics_audio") or {}
    metrics_content = input_data.get("metrics_content") or {}
    duration_minutes = float(input_data.get("duration_minutes") or 0)
    if duration_minutes <= 0:
        duration_minutes = max(0.1, float(metrics_audio.get("duration_seconds", 0)) / 60.0)

    transcript_excerpt = (transcript or "(no transcript)")[:4000]
    speech_ratio = float(metrics_audio.get("speech_ratio", 0.5))
    audio_energy = float(metrics_audio.get("audio_energy", 0.5))
    question_count = int(metrics_content.get("question_count", 0))
    example_count = int(metrics_content.get("example_count", 0))
    structure_score = float(metrics_content.get("structure_score", 0))
    interaction_score = float(metrics_content.get("interaction_score", 0))

    prompt_user = USER_PROMPT_TEMPLATE.format(
        duration_minutes=duration_minutes,
        speech_ratio=speech_ratio,
        audio_energy=audio_energy,
        question_count=question_count,
        example_count=example_count,
        structure_score=structure_score,
        interaction_score=interaction_score,
        transcript_excerpt=transcript_excerpt,
    )
    text = _call_gemini(prompt_user)
    parsed = _parse_and_validate(text) if text else None
    if parsed:
        return {
            "semantic_strengths": parsed["semantic_strengths"],
            "semantic_improvements": parsed["semantic_improvements"],
            "session_summary": parsed["session_summary"],
            "reasoning_notes": parsed["reasoning_notes"],
        }
    # Fallback: empty semantic structure so pipeline still stores session; UI can show rule-based only
    return {
        "semantic_strengths": [],
        "semantic_improvements": [],
        "session_summary": "",
        "reasoning_notes": "",
    }
