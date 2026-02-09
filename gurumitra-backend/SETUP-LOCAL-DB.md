# Local PostgreSQL setup (when Neon is unreachable)

Your machine cannot resolve the Neon host. Use local PostgreSQL instead.

## 1. Install PostgreSQL

**Windows:** Download and run the installer from https://www.postgresql.org/download/windows/

- During setup, set a password for the `postgres` user (e.g. `postgres`).
- Leave port as **5432**.

## 2. Create the database

Open **Command Prompt** or **PowerShell** and run:

```powershell
psql -U postgres -c "CREATE DATABASE gurumitra;"
```

(Use the password you set for `postgres`. If `psql` is not in PATH, use the SQL Shell from the Start menu or run from the Postgres bin folder.)

Or in **pgAdmin**: right-click Databases → Create → Database → name: `gurumitra`.

## 3. Update .env (if your postgres user/password differ)

In `gurumitra-backend\.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/gurumitra
```

## 4. Run backend

```powershell
cd gurumitra-backend
npm run db:migrate
npm run db:seed
npm start
```

---

**Alternative: Docker**

If you have Docker Desktop:

```powershell
cd gurumitra-backend
docker compose up -d
```

Then run migrate, seed, and `npm start`. The `.env` is already set for the Docker container.
