# GuruMitra Feedback Flow & Requirements Checklist

## 1. Consistent feedback per video

- **Content hash:** SHA-256 of video (URL canonical form or file buffer). Stored in `classroom_sessions.content_hash`.
- **Reuse:** If a completed session with the same `content_hash` exists, its scores and feedback are **copied** to the new session; the analyzer is not called again.
- **Storage:** Results stored by `session_id` (and thus `teacher_id`). Reuse is decided by `content_hash`; each session still gets its own row in `scores` and `feedback`.

See `gurumitra-backend/ARCHITECTURE.md` and `src/utils/contentHash.js`, `src/services/aiProcessor.js`.

---

## 2. Session-based feedback

- **Session entity:** `classroom_sessions`: `id` (session_id), `teacher_id`, `video_url`, `created_at`, `status` (analysis_status).
- **Feedback** is always linked to a session: `feedback.session_id`, `scores.session_id` → `classroom_sessions.id`.
- **Dashboards** load feedback only via session: Teacher uses `GET /api/teacher/sessions/:sessionId/feedback` and `.../scores`; Management/Admin use aggregated or full session APIs.

No demo shortcuts: every upload creates a real session; feedback is stored only after analysis (or reuse).

---

## 3. Feedback ownership and pipeline

1. **Teacher uploads video** → Backend creates session (`status = 'processing'`).
2. **Backend** stores session; calls `processSessionAsync(sessionId, teacherId)`.
3. **aiProcessor** checks for existing completed session with same `content_hash`; if found, reuses; else calls **analyzer** (Python) with `video_url`.
4. **analyzer.py** downloads video, extracts audio, computes metrics, returns **deterministic** scores and feedback.
5. **Backend** writes to `scores` and `feedback` for that `session_id`, sets `status = 'completed'`.
6. **Dashboards** read from DB only. No frontend-generated or mocked feedback.

---

## 4. Role-based dashboards (strict)

| Role        | Teacher dashboard | Management dashboard | Admin dashboard |
|------------|-------------------|----------------------|-----------------|
| **Teacher** | Upload; own sessions only; feedback, strengths, improvements, trends | — | — |
| **Management** | — | Aggregated metrics; no raw video; avg scores; trends; no upload | — |
| **Admin** | — | — | Full access; manage users; all sessions; system activity |

Enforced in backend with `requireRole('teacher' | 'management' | 'admin')` and teacher-scoped queries (`teacher_id = req.user.id`). Frontend routes and UI are role-specific (Teacher / Management / Admin portals).

---

## 5. Analyzer determinism

- **Stable thresholds:** All thresholds are named constants in `gurumitra-ai/analyzer.py` (e.g. `THRESHOLD_SPEECH_LOW`, `THRESHOLD_ENERGY_MID`).
- **Round before rules:** Scores are rounded to one decimal **immediately** after computation; all conditionals (strengths, improvements, recommendations) use these **rounded** values so identical metrics always produce identical output.
- **Metrics logging:** Backend logs `[session_metrics]` with `session_id`, `teacher_id`, and `metrics` when the analyzer returns (see `aiProcessor.js`).

---

## 6. Future real-time AI (not implemented)

- Analysis remains **post-session only**: one request per session, response when done.
- **Preparation:** `aiServiceClient.js` is the single place that talks to the analyzer. To add real-time (e.g. Whisper, WebSocket, live chunks), replace `analyzeVideo()` with a streaming client; `aiProcessor` can continue to store final (and optionally intermediate) results by `session_id`. No change to dashboard APIs.

---

## 7. Frontend

- **No hardcoded teacher:** User and role come from login (JWT); all data is fetched by API using the authenticated user.
- **Dynamic by role:** Routes and dashboards are selected by role (Teacher / Management / Admin).
- **Loading and transitions:** "Expert analysis in progress" while `status === 'processing'`; polling until `completed` or `failed`; then show feedback or error.

---

## File structure (high level)

```
GuruMitra/
├── FEEDBACK_FLOW.md          (this file)
├── RUN.md                    (how to run all services)
├── gurumitra-backend/
│   ├── ARCHITECTURE.md       (backend detail: storage, pipeline, roles)
│   ├── src/
│   │   ├── db/schema.sql     (users, classroom_sessions, feedback, scores)
│   │   ├── routes/           (auth, teacher, management, admin)
│   │   ├── services/         (aiProcessor, aiServiceClient)
│   │   └── utils/contentHash.js
├── gurumitra-ai/
│   ├── analyzer.py           (deterministic metrics + feedback; stable thresholds)
│   └── main.py               (POST /analyze)
└── gurumitra-frontend/
    └── src/                  (role-based routes; no mock data)
```

No mock data; no random scores; no demo shortcuts. Production-oriented flow end to end.
