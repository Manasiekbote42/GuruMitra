# Use Neon PostgreSQL – Fix "ENOTFOUND" on your machine

Your `.env` is set to use Neon. If you see **getaddrinfo ENOTFOUND ep-twilight-resonance-ah2b8jwm-pooler...** it means your PC or network cannot resolve Neon’s hostname. Try these in order:

---

## 0. Quick check (Command Prompt or PowerShell)

Run:

```cmd
nslookup ep-twilight-resonance-ah2b8jwm-pooler.c-3.us-east-1.aws.neon.tech
```

- **"can't find" or no address** → DNS is the problem: do Step 1 (Google DNS) and Step 2 (Direct connection).
- **An IP address** → DNS is OK; try Step 2 (Direct connection) or another network.

---

## 1. Try Google DNS (often fixes it on Windows)

1. Open **Settings** → **Network & Internet** → **Ethernet** or **Wi‑Fi** → click your connection → **Edit** under "DNS server assignment".
2. Choose **Manual**, turn **IPv4** on, and set:
   - **Preferred DNS:** `8.8.8.8`
   - **Alternate DNS:** `8.8.4.4`
3. Save, then **flush DNS** in PowerShell (Run as Administrator):
   ```powershell
   ipconfig /flushdns
   ```
4. Restart the backend:
   ```powershell
   cd gurumitra-backend
   npm start
   ```

---

## 2. Try Neon’s "Direct" connection (different hostname)

Sometimes the **pooler** host fails but the **direct** host works.

1. Open **[Neon Console](https://console.neon.tech)** → your project.
2. Go to **Connection details** / **Connection string**.
3. Switch to **Direct connection** (not Pooled).
4. Copy that URL (host will look like `ep-xxx.us-east-1.aws.neon.tech` without `-pooler`).
5. In `gurumitra-backend\.env`, set:
   ```env
   DATABASE_URL=<paste the direct connection string>
   ```
6. Run again: `npm start`, then `npm run db:migrate` and `npm run db:seed` if needed.

---

## 3. Try another network

- Use **mobile hotspot** (phone’s 4G/5G) and run the app again.
- Or try a **different Wi‑Fi** (e.g. home vs office).

If it works on another network, the first network (or firewall) is blocking or mis-resolving Neon.

---

## 4. Run SQL in Neon’s SQL Editor (no DNS from your PC)

Your app still needs to reach Neon from your machine, but you can create tables and seed data from the browser:

1. In **[Neon Console](https://console.neon.tech)** → your project → **SQL Editor**.
2. Run the contents of `gurumitra-backend/src/db/schema.sql` (create tables).
3. For demo users, run the equivalent of the seed (insert into `users` with bcrypt password). You can generate a hash at https://bcrypt-generator.com (rounds 10) for `demo123` and insert the three users.

This doesn’t fix ENOTFOUND for Node, but it gets the database ready once the connection works.

---

## 5. Confirm the connection string

- In Neon: **Dashboard** → **Connection string**.
- Copy the **current** string and paste it into `DATABASE_URL` in `.env`.
- If the host in the error is different from the one in the dashboard, replace with the dashboard URL.

---

After one of these works, run:

```powershell
cd gurumitra-backend
npm run db:migrate
npm run db:seed
npm start
```

Your `.env` is already set for Neon; the goal is to fix DNS/network so your machine can reach Neon’s host.
