# Troubleshooting

## `getaddrinfo ENOTFOUND ... neon.tech`

Your app is still using an old Neon URL whose host no longer resolves. Use **one** of the two options below.

---

### Option A: Use local PostgreSQL (no Neon, no internet needed)

1. **Start PostgreSQL in Docker** (from `gurumitra-backend`):

   ```bash
   docker-compose up -d
   ```

2. **Create `.env`** in `gurumitra-backend` (if it doesn’t exist) and set:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gurumitra
   PORT=3001
   JWT_SECRET=your-secret-key
   AI_SERVICE_URL=http://localhost:8000
   ```

3. **Run migrate and seed:**

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Start the backend:**

   ```bash
   npm start
   ```

---

### Option B: Use Neon again

1. Open [Neon Console](https://console.neon.tech) and get the **current** connection string from your project’s dashboard.
2. In `gurumitra-backend/.env`, set **only**:

   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@ep-XXXX-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

   (Use the exact URL from Neon; the host must be the one shown in the dashboard.)

3. Then run `npm run db:migrate`, `npm run db:seed`, and `npm start`.
