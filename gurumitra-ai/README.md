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
