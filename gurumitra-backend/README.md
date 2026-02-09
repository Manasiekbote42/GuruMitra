# GuruMitra Backend

Node.js + Express + Neon PostgreSQL backend for GuruMitra. Roles: **Teacher**, **Management**, **Admin**. Teacher flow is implemented first.

## Quick start

1. **Clone / open** the `gurumitra-backend` folder in Cursor.
2. **Install:** `npm install`
3. **Environment:** Copy `.env.example` to `.env` and set:
   - `DATABASE_URL` — your Neon PostgreSQL connection string (paste from Neon dashboard).
   - `JWT_SECRET` — any long random string for production.
4. **Database:** Run migration then seed:
   - `npm run db:migrate`
   - `npm run db:seed`
5. **AI microservice (required for video analysis):** Run the Python service so the backend can call it. From repo root: `cd gurumitra-ai && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000`. Set `AI_SERVICE_URL=http://localhost:8000` in `.env` (see `.env.example`).
6. **Run:** `npm run dev` or `npm start`
7. **Health:** Open `http://localhost:3001/health`

## Frontend (Lovable)

- Teacher: `https://mitra-vision-lab.lovable.app/teacher`
- CORS is enabled for that origin and localhost.

## API base URL

- Local: `http://localhost:3001`
- Use this as base for all requests below.

---

## Postman / Testing

### 1. Health check (no auth)

- **GET** `{{baseUrl}}/health`
- Example: `http://localhost:3001/health`
- Expected: `{ "status": "ok", "timestamp": "...", "database": "connected" }`

### 2. Login (get JWT)

- **POST** `{{baseUrl}}/api/auth/login`
- Body (JSON):  
  `{ "email": "teacher@gurumitra.demo", "password": "demo123" }`
- Other users: `management@gurumitra.demo`, `admin@gurumitra.demo` (same password).
- Response: `{ "token": "<JWT>", "user": { "id", "name", "email", "role", "department" } }`
- Use the `token` value in the **Authorization** header: `Bearer <token>` for all protected routes.

### 3. Teacher APIs (role: teacher)

- **POST** Upload session (video URL mocked)  
  **POST** `{{baseUrl}}/api/teacher/sessions`  
  Headers: `Authorization: Bearer <teacher_token>`  
  Body: `{ "video_url": "https://example.com/video.mp4" }`  
  Returns: session object with `id`, `teacher_id`, `video_url`, `uploaded_at`, `status`.

- **GET** List my sessions  
  **GET** `{{baseUrl}}/api/teacher/sessions`  
  Headers: `Authorization: Bearer <teacher_token>`

- **GET** AI feedback for session (mock)  
  **GET** `{{baseUrl}}/api/teacher/sessions/:sessionId/feedback`  
  Headers: `Authorization: Bearer <teacher_token>`  
  Returns: strengths, improvements, recommendations (realistic mock).

- **GET** Performance scores  
  **GET** `{{baseUrl}}/api/teacher/sessions/:sessionId/scores`  
  Headers: `Authorization: Bearer <teacher_token>`  
  Returns: clarity_score, engagement_score, interaction_score, overall_score (mock if no DB row).

- **GET** Training recommendations (mock)  
  **GET** `{{baseUrl}}/api/teacher/recommendations`  
  Headers: `Authorization: Bearer <teacher_token>`  
  Returns: list of training modules (eye contact, body language, etc.).

### 4. Management APIs (role: management or admin)

- **GET** All teachers  
  **GET** `{{baseUrl}}/api/management/teachers`  
  Headers: `Authorization: Bearer <management_token>`

- **GET** Department-wise average scores  
  **GET** `{{baseUrl}}/api/management/scores/department`  
  Headers: `Authorization: Bearer <management_token>`

- **GET** Monthly trends (optional: `?year=2025`)  
  **GET** `{{baseUrl}}/api/management/scores/trends`  
  **GET** `{{baseUrl}}/api/management/scores/trends?year=2025`

- **GET** Quarterly performance  
  **GET** `{{baseUrl}}/api/management/scores/quarterly`  
  Headers: `Authorization: Bearer <management_token>`

### 5. Admin APIs (role: admin only)

- **POST** Add user  
  **POST** `{{baseUrl}}/api/admin/users`  
  Headers: `Authorization: Bearer <admin_token>`  
  Body: `{ "name": "New User", "email": "new@example.com", "password": "secret", "role": "teacher", "department": "Science" }`  
  Returns: created user (no password).

- **PATCH** Assign role  
  **PATCH** `{{baseUrl}}/api/admin/users/:userId/role`  
  Headers: `Authorization: Bearer <admin_token>`  
  Body: `{ "role": "management" }`

- **GET** List users (optional: `?role=teacher`)  
  **GET** `{{baseUrl}}/api/admin/users`  
  **GET** `{{baseUrl}}/api/admin/users?role=teacher`

- **GET** System activity  
  **GET** `{{baseUrl}}/api/admin/activity`  
  **GET** `{{baseUrl}}/api/admin/activity?limit=20`

---

## Example API responses (Teacher dashboard)

**GET /api/teacher/sessions/:id/feedback** (mock):

```json
{
  "session_id": "uuid",
  "strengths": ["Clear explanation...", "Effective use of board...", "Students were engaged..."],
  "improvements": ["Increase eye contact...", "Body language: avoid crossing arms...", "Pause after asking questions..."],
  "recommendations": ["Practice maintaining eye contact...", "Include one open-ended question per 10 min..."],
  "generated_at": "2025-02-02T..."
}
```

**GET /api/teacher/sessions/:id/scores** (mock):

```json
{
  "session_id": "uuid",
  "clarity_score": 4.2,
  "engagement_score": 3.8,
  "interaction_score": 4.0,
  "overall_score": 4.0,
  "generated_at": "2025-02-02T..."
}
```

**GET /api/teacher/recommendations** (mock):

```json
{
  "modules": [
    { "id": "tm1", "title": "Eye Contact & Presence", "description": "...", "duration": "15 min", "priority": "high" },
    { "id": "tm2", "title": "Body Language for Teaching", "description": "...", "duration": "20 min", "priority": "high" }
  ],
  "generated_at": "2025-02-02T..."
}
```

---

## Project structure

```
gurumitra-backend/
├── src/
│   ├── index.js           # Express app, CORS, routes
│   ├── config/db.js       # Neon PostgreSQL pool & query helper
│   ├── db/
│   │   ├── schema.sql     # Tables: users, classroom_sessions, feedback, scores, system_activity
│   │   ├── migrate.js     # Run schema
│   │   └── seed.js        # Demo users (teacher, management, admin)
│   ├── middleware/auth.js # JWT verify, requireRole, signToken
│   ├── routes/
│   │   ├── auth.js        # POST /login, GET /me
│   │   ├── teacher.js     # Sessions, feedback, scores, recommendations
│   │   ├── management.js  # Teachers, department scores, trends
│   │   └── admin.js       # Users CRUD, role assign, activity
│   ├── services/
│   │   ├── aiProcessor.js    # Pipeline: reuse by hash or call Python AI service, save to DB
│   │   └── aiServiceClient.js # HTTP client for Python AI microservice
├── .env.example
├── package.json
└── README.md
```

## Database (Neon)

- Run the SQL in `src/db/schema.sql` via Neon SQL Editor, or run `npm run db:migrate` (requires `DATABASE_URL` in `.env`).
- Tables: `users`, `classroom_sessions` (with optional `upload_metadata` JSONB for duration/speech_ratio/audio_energy), `feedback`, `scores`, `system_activity` with proper foreign keys.
- Each upload gets a unique session id and content hash. The Python AI microservice analyzes video/audio and returns deterministic feedback; results are stored in `feedback` and `scores`. Same video (same hash) reuses existing feedback. Dashboards read only from the database.

All endpoints return JSON. Use the demo users and token from login for testing; all protected endpoints require `Authorization: Bearer <token>`.
