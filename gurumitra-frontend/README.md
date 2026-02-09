# GuruMitra Frontend

React (Vite) frontend for GuruMitra — AI-powered teacher performance and coaching.

**Stack:** React, Vite, Tailwind CSS, Axios, Recharts, React Router, JWT auth.

## Quick start

1. `npm install`
2. Copy `.env.example` to `.env` and set `VITE_API_URL=http://localhost:3001`
3. `npm run dev` → http://localhost:5173
4. Login: `teacher@gurumitra.demo` / `demo123` (or management / admin)

## Roles & routes

| Role        | Dashboard              |
|------------|------------------------|
| Teacher    | `/teacher/dashboard`   |
| Management | `/management/dashboard`|
| Admin      | `/admin/dashboard`     |

## Structure

- `src/components/` — Sidebar, Navbar, Card, Table, ProtectedLayout
- `src/context/` — AuthContext
- `src/hooks/` — useProtectedRoute
- `src/pages/` — Login, teacher/*, management/*, admin/*
- `src/services/api.js` — Axios + all API calls

Ensure the backend is running and CORS allows `http://localhost:5173`.
