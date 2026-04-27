# RAAISE Local Dev — Quick Start

Run these in order every time you restart your machine.

---

## Step 1 — Start Docker Desktop

Open **Docker Desktop** from the Start menu. Wait until the whale icon in the taskbar is steady (not animated). Takes ~30 seconds.

---

## Step 2 — Start MySQL (PowerShell)

```powershell
docker start raaise-mysql
```

If you see `Error: No such container`, the container was deleted. Run this instead (one-time recreate):

```powershell
docker run --name raaise-mysql -e MYSQL_ROOT_PASSWORD=raaise -e MYSQL_DATABASE=raaise -e TZ=Asia/Kolkata -p 3306:3306 -d mysql:8
```

Then wait 20 seconds and import the dump (one-time only):

```powershell
cd "e:\Official Github Repositories\RAAISE-MVP-3\RAAISE-MVP-3"
Get-Content raaise_dump.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
```

---

## Step 3 — Refresh seed data (every session)

Timestamps in the DB age out after 30 minutes. Always run this after starting MySQL:

```powershell
cd "e:\Official Github Repositories\RAAISE-MVP-3\RAAISE-MVP-3"
Get-Content refresh_data.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
```

You should see output ending with rows for `User_Location_Pred`, `Sensor_Status`, `User_Registration`.

---

## Step 4 — Start the dashboard (PowerShell)

```powershell
cd "e:\Official Github Repositories\RAAISE-MVP-3\RAAISE-MVP-3\raaise-dashboard-wording-updated"
npm run dev
```

Open **http://localhost:3000**

---

## Restarting / reseeding during a session

### Reseed the database (map is empty or users frozen)

Data ages out every ~30 minutes. Run this any time to refresh it:

```powershell
cd "e:\Official Github Repositories\RAAISE-MVP-3\RAAISE-MVP-3"
Get-Content refresh_data.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
```

No need to restart the dashboard — it polls automatically.

---

### Restart the dashboard (Next.js dev server)

In the terminal where `npm run dev` is running:

1. Press **Ctrl+C** to stop it
2. Run again:

```powershell
cd "e:\Official Github Repositories\RAAISE-MVP-3\RAAISE-MVP-3\raaise-dashboard-wording-updated"
npm run dev
```

Then open **http://localhost:3000** again.

---

### Restart MySQL (container stopped or machine rebooted)

```powershell
docker start raaise-mysql
```

Then re-run the reseed command above before starting the dashboard.

---

## If the map looks empty

Re-run the reseed command above. Data ages out every ~30 minutes during a session too.

---

## Common errors

| Error | Fix |
|---|---|
| `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop isn't running — open it and wait |
| `container name already in use` | `docker stop raaise-mysql` then `docker rm raaise-mysql`, re-run Step 2 |
| `'<' operator is reserved` | You're in PowerShell — use `Get-Content ... \| docker exec` syntax, not `<` |
| `ENOENT package.json` | Wrong folder — make sure you're in `raaise-dashboard-wording-updated` |
| `ExecutionPolicy` error | Run once: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| Port 3306 in use | Change `-p 3306:3306` to `-p 3307:3306` and set `DB_HOST=localhost:3307` in `.env.local` |
