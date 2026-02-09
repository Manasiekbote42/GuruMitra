# GuruMitra AI Microservice

Python service that analyzes classroom videos and returns deterministic, rule-based feedback.

## Requirements

- Python 3.10+
- **ffmpeg** installed on the system (required by pydub for audio extraction)

## Setup

```bash
cd gurumitra-ai
python -m venv venv
# Windows: venv\Scripts\activate
# Unix: source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Health: http://localhost:8000/health

### Running from Cursor only

If you run the AI service from Cursor’s terminal, ffmpeg may not be on PATH. Use a `.env` file in this folder:

1. Copy `.env.example` to `.env`.
2. Set `FFMPEG_PATH` to the full path of your `ffmpeg.exe` (e.g. `C:\ffmpeg\bin\ffmpeg.exe`).  
   To find it: open **Command Prompt** and run `where ffmpeg`, then copy the path.
3. In Cursor: open a terminal, `cd gurumitra-ai`, activate venv, run `pip install -r requirements.txt` if needed, then `uvicorn main:app --host 0.0.0.0 --port 8000`.

The app loads `.env` on startup and uses `FFMPEG_PATH` so pydub can find ffmpeg.

## API

**POST /analyze**

Body (JSON): `{ "video_url": "https://example.com/classroom.mp4" }`

- Downloads the video
- Extracts audio
- Computes: duration, speaking time %, silence %, audio energy
- Returns deterministic scores and feedback (same video → same output)

Response shape: `pedagogy_score`, `engagement_score`, `delivery_score`, `curriculum_score`, `feedback`, `strengths`, `improvements`, `recommendations`, `metrics`.

### Optional: Gemini API for feedback

When **GEMINI_API_KEY** is set, the service uses Google’s Gemini API to generate feedback (strengths, improvements, recommendations, summary and scores) from the transcript and metrics. Otherwise it uses built-in rule-based feedback.

1. Get an API key: [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Set in `.env` (or environment):
   - `GEMINI_API_KEY=your_key`
   - Optional: `GEMINI_MODEL=gemini-1.5-flash` (default) or `gemini-1.5-pro`, `gemini-2.0-flash`, etc.

If the Gemini call fails or the key is missing, the analyzer falls back to rule-based feedback automatically.

### Phase 4: Semantic evaluator (ai_evaluator.py)

After each run, the pipeline calls `evaluate_teaching_semantics()` with transcript, segments, and metrics. The LLM (Gemini, temperature=0) returns **explainable, audit-safe** feedback:

- `semantic_strengths` / `semantic_improvements`: each item has `point` and `evidence` (transcript or metric).
- `session_summary`, `reasoning_notes`.

Same video + same transcript → same semantic feedback. Output is merged into the session response and stored in `analysis_result.semantic_feedback`. No randomness; evidence must reference transcript or provided metrics.

## Integration

The Node.js backend calls this service for each new upload (when no existing result exists for the same video hash). Results are stored in PostgreSQL; dashboards read only from the database.

## Troubleshooting

- **"No module named 'whisper'"** — Whisper is required for transcription. Install it in the same environment that runs the AI service:
  ```bash
  cd gurumitra-ai
  # If using a venv (recommended): venv\Scripts\activate  (Windows) or source venv/bin/activate (Unix)
  pip install -r requirements.txt
  ```
  If you use a virtualenv, start uvicorn with that env activated so it finds `whisper`. The package that provides the module is `openai-whisper` (see `requirements.txt`).

- **"ffmpeg not found"** but `ffmpeg -version` works in Command Prompt: the process (e.g. Cursor) may not have ffmpeg on PATH. Set the full path before starting uvicorn:
  ```cmd
  set FFMPEG_PATH=C:\path\to\ffmpeg\bin\ffmpeg.exe
  uvicorn main:app --host 0.0.0.0 --port 8000
  ```
  To find the path, in a Command Prompt where `ffmpeg` works run: `where ffmpeg`

- **Port 8000 already in use**: stop the other process using port 8000, or use another port (e.g. `--port 8001`) and set `AI_SERVICE_URL=http://localhost:8001` in the backend `.env`.

- **venv not found**: create it first: `python -m venv venv`, then `venv\Scripts\activate`.
