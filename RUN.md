# How to run GuruMitra (full stack)

**Quick run (3 terminals):**

| Terminal | Command | URL |
|----------|---------|-----|
| 1 – AI | `cd gurumitra-ai` → activate venv → `pip install -r requirements.txt` → `uvicorn main:app --host 0.0.0.0 --port 8000` | http://localhost:8000/health |
| 2 – Backend | `cd gurumitra-backend` → `npm install` → `npm run db:migrate` → `npm run db:seed` → `npm run dev` | http://localhost:3001/health |
| 3 – Frontend | `cd gurumitra-frontend` → `npm install` → `npm run dev` | http://localhost:5173 (login / signup) |

You need **three** processes: **AI service (Python)**, **Backend (Node)**, **Frontend (React)**.

## 1. AI microservice (Python)

Required for video analysis. **ffmpeg** must be installed. **Whisper** (speech-to-text) is used for Phase-2 feedback.

```bash
cd gurumitra-ai
python -m venv venv
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows CMD: venv\Scripts\activate
# Unix: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Note:** First `pip install` may take a few minutes (Whisper + PyTorch). First analysis may be slower while the Whisper model loads.

- Health: http://localhost:8000/health

**Running from Cursor:** If ffmpeg is not on PATH in Cursor’s terminal, create `gurumitra-ai/.env` (copy from `.env.example`) and set `FFMPEG_PATH` to the full path of `ffmpeg.exe`. Find it by running `where ffmpeg` in Command Prompt.

## 2. Backend (Node)

```bash
cd gurumitra-backend
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, AI_SERVICE_URL=http://localhost:8000
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Health: http://localhost:3001/health

## 3. Frontend (React)

```bash
cd gurumitra-frontend
npm install
npm run dev
```

- App: http://localhost:5173

## Flow

1. Teacher uploads a **video URL** (or creates session). Backend creates a session with a unique **session_id** and **content_hash** (SHA256 of URL + metadata), status = `processing`.
2. If the same video (same hash) was already processed, the backend **reuses** stored feedback. Otherwise it **calls the Python AI service** with the video URL.
3. The AI service downloads the video, extracts audio, computes duration / speaking time % / silence % / audio energy, and returns **deterministic** scores and feedback. Backend stores them in PostgreSQL.
4. Frontend **polls** the backend every few seconds; Teacher, Management, and Admin dashboards show updated data when processing completes.
5. Role-based access is unchanged: Teacher (upload + own feedback), Management (all teachers, no upload), Admin (users + monitoring).

## Demo logins

| Role       | Email                     | Password  |
|-----------|----------------------------|-----------|
| Teacher   | teacher@gurumitra.demo    | demo123   |
| Management| management@gurumitra.demo | demo123   |
| Admin     | admin@gurumitra.demo      | demo123   |
