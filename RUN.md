# How to run GuruMitra (full stack)

You need **three** processes: **AI service (Python)**, **Backend (Node)**, **Frontend (React)**.

---

## Steps to run (in order)

### Step 1 – Backend setup (once)

1. Open a terminal and go to the backend folder:
   ```bash
   cd gurumitra-backend
   ```
2. Copy env and set your database URL and JWT secret:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`: set **DATABASE_URL** (Neon PostgreSQL), **JWT_SECRET**, and **AI_SERVICE_URL=http://localhost:8000**.
3. Install dependencies and run migrations:
   ```bash
   npm install
   npm run db:migrate
   npm run db:migrate:phase5
   npm run db:seed
   ```

### Step 2 – AI service setup (once)

1. Open a **second** terminal:
   ```bash
   cd gurumitra-ai
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   ```
   - **Windows PowerShell:** `.\venv\Scripts\Activate.ps1`
   - **Windows CMD:** `venv\Scripts\activate.bat`
   - **Mac/Linux:** `source venv/bin/activate`
3. Install Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. (Optional) For AI feedback and semantic evaluation, add your Gemini API key. Copy `.env.example` to `.env` if you don’t have one, then set:
   ```bash
   GEMINI_API_KEY=your_key_here
   ```
   Get a key at: https://aistudio.google.com/app/apikey  
   If ffmpeg is not on PATH, also set **FFMPEG_PATH** in `.env` to the full path of `ffmpeg.exe`.

### Step 3 – Frontend setup (once)

1. Open a **third** terminal:
   ```bash
   cd gurumitra-frontend
   npm install
   ```

### Step 4 – Start all three services

Run each in its own terminal and leave them running.

| Terminal | Command | URL when running |
|----------|---------|-------------------|
| **1 – AI** | `cd gurumitra-ai` → activate venv → `uvicorn main:app --host 0.0.0.0 --port 8000` | http://localhost:8000/health |
| **2 – Backend** | `cd gurumitra-backend` → `npm run dev` | http://localhost:3001/health |
| **3 – Frontend** | `cd gurumitra-frontend` → `npm run dev` | http://localhost:5173 |

### Step 5 – Use the app

1. Open **http://localhost:5173** in your browser.
2. Sign up (any email) or use demo logins (see table below).
3. **Teacher:** Upload a video (URL or file) and wait for “Expert feedback ready”; view feedback on the dashboard.
4. **Management:** View teachers and department overview (school-scoped).
5. **Admin:** Manage users, view system status and audit logs.

---

**Quick reference (after first-time setup):**

| Terminal | Command |
|----------|---------|
| 1 – AI | `cd gurumitra-ai` → activate venv → `uvicorn main:app --host 0.0.0.0 --port 8000` |
| 2 – Backend | `cd gurumitra-backend` → `npm run dev` |
| 3 – Frontend | `cd gurumitra-frontend` → `npm run dev` |

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
5. Phase 5: Role-based and school-scoped. Teacher (upload + own feedback), Management (teachers in their school only), Admin (all users, schools, audit logs). Sessions are locked after feedback is generated.

## Demo logins

| Role       | Email                     | Password  |
|-----------|----------------------------|-----------|
| Teacher   | teacher@gurumitra.demo    | demo123   |
| Management| management@gurumitra.demo | demo123   |
| Admin     | admin@gurumitra.demo      | demo123   |
