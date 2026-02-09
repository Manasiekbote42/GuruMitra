# GuruMitra Backend Architecture

## 1. Feedback consistency per video

- **Content hash (SHA-256)**  
  - **URL uploads:** `content_hash = SHA256(canonical JSON of video_url + optional upload_metadata)`.  
  - **File uploads:** `content_hash = SHA256(raw file buffer)`.  
  Implemented in `src/utils/contentHash.js` (`computeContentHash`, `computeFileHash`).

- **Reuse rule**  
  Before calling the analyzer, the backend looks up any **completed** session with the same `content_hash`. If found, it **copies** that session’s scores and feedback into the **current** session (by `session_id`). So the same video always yields the same analysis result; only the first analysis runs the Python service.

- **Storage keying**  
  Analysis results are stored **per session**:
  - `scores` and `feedback` are keyed by `session_id` (FK to `classroom_sessions.id`).
  - Each row is also tied to a **teacher** via `classroom_sessions.teacher_id`.
  - `content_hash` is used only to **decide reuse**; it is not the primary key for feedback.  
  So: **video_hash** (content_hash) + **teacher_id** + **session_id** all apply: feedback is stored by `session_id`, and reuse is by `content_hash`.

---

## 2. Session-based feedback (no demo shortcuts)

- **Session entity** (`classroom_sessions`):
  - `id` (UUID) = `session_id`
  - `teacher_id`, `video_url`, `uploaded_at`, `created_at`
  - `status` = analysis status: `pending` | `processing` | `completed` | `failed`
  - `content_hash`, `upload_metadata`, `error_message` (optional)

- **Feedback** is always linked to a session:
  - `feedback.session_id` → `classroom_sessions.id`
  - `scores.session_id` → `classroom_sessions.id`

- **Dashboards** load feedback only by session:
  - Teacher: `GET /api/teacher/sessions/:sessionId/feedback` and `.../scores` (own sessions only).
  - Management: aggregated by teacher from DB (no raw video).
  - Admin: all sessions and feedback.

---

## 3. Feedback ownership and pipeline

**Pipeline (no frontend-generated or mocked feedback):**

1. **Teacher uploads video**  
   - URL: `POST /api/teacher/sessions` with `video_url`.  
   - File: `POST /api/teacher/sessions/upload` (multipart).  
   Backend creates a row in `classroom_sessions` with `status = 'processing'` and computes `content_hash`.

2. **Backend creates session**  
   Session is stored in PostgreSQL; no feedback yet.

3. **analyzer.py analyzes video**  
   - Backend calls the Python service (POST with `video_url`).  
   - If a completed session with the same `content_hash` exists, backend **reuses** its scores/feedback and skips the HTTP call.  
   - Otherwise: Python downloads video (or backend serves uploaded file URL), extracts audio, computes metrics, returns **deterministic** scores and feedback.

4. **Deterministic feedback generated**  
   Rules in `analyzer.py` use **stable thresholds** and **rounded metrics** so identical audio → identical output.

5. **Feedback stored in DB**  
   Backend writes to `scores` and `feedback` for that `session_id`, and sets `classroom_sessions.status = 'completed'` (or `'failed'` on error).

6. **Dashboards consume stored feedback**  
   All UI data comes from the API; APIs read only from PostgreSQL. No mock or random data.

---

## 4. Role-based dashboards (strict)

| Role        | Access |
|------------|--------|
| **Teacher** | Upload videos; list **only own** sessions; view feedback, strengths, improvements, trends, recommendations for own sessions. Session playback/reflection via own session detail. |
| **Management** | Aggregated metrics across teachers; **no** raw video; average pedagogy/engagement/delivery scores; improvement trends per teacher; **no** upload. |
| **Admin** | Full access: manage teachers and managers; view all sessions and feedback; system health and activity logs. |

- **Enforcement:** `src/middleware/auth.js`: `authenticate` (JWT) + `requireRole('teacher' | 'management' | 'admin')` on each route.
- **Teacher routes:** All queries filter by `teacher_id = req.user.id`.
- **Management routes:** Read-only; no `POST /api/teacher/sessions` (or upload) for this role.
- **Admin routes:** CRUD users; read all sessions/activity.

---

## 5. File structure and data flow

```
gurumitra-backend/
├── src/
│   ├── config/db.js          # DB pool, query()
│   ├── db/
│   │   ├── schema.sql        # tables: users, classroom_sessions, feedback, scores, system_activity
│   │   ├── migrate.js        # run schema
│   │   └── seed.js           # demo users
│   ├── middleware/auth.js    # JWT + requireRole
│   ├── routes/
│   │   ├── auth.js           # login, /me
│   │   ├── teacher.js        # sessions CRUD, feedback/scores by session_id (own only)
│   │   ├── management.js     # recent-sessions, teachers, feedback-summary, scores (read-only)
│   │   └── admin.js          # users CRUD, activity
│   ├── services/
│   │   ├── aiProcessor.js    # processSessionAsync: reuse by content_hash or call analyzer, then save to DB
│   │   └── aiServiceClient.js # HTTP client to Python analyzer (replaceable by WebSocket for future real-time)
│   ├── utils/contentHash.js  # computeContentHash (URL), computeFileHash (buffer)
│   └── index.js              # Express app, CORS, routes, session-file serve
```

**Data flow:**  
Upload → `teacher.js` → insert `classroom_sessions` → `processSessionAsync(sessionId, teacherId)` → (reuse by `content_hash` or) `aiServiceClient.analyzeVideo(videoUrl)` → Python analyzer → `aiProcessor` writes `scores` + `feedback` by `session_id` → dashboards call teacher/management/admin APIs → read from DB.

---

## 6. Future real-time AI (not implemented)

- Analysis is **post-session only**: one request per session, response when done.
- To add **real-time** later (e.g. Whisper, live chunks, WebSocket updates):
  - Replace or extend `aiServiceClient.js` with a WebSocket client that streams audio chunks and receives incremental results.
  - Keep the same **session** and **feedback** model; backend still stores final (and optionally intermediate) results by `session_id`.
  - No change to dashboard contracts: they still fetch feedback by session.
