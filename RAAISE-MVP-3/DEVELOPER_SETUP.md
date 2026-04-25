# RAAISE Dashboard — Local Setup Guide

This guide gets the RAAISE dashboard running locally on your machine with seeded data, so you can work on the 3D map redesign without needing any of the physical sensors or the gateway VM.

---

## 1. What this project is

RAAISE is an IoT access-control + indoor-tracking system. The full stack looks like this:

```
Arduino sensors (FPR / NFC / RFID / PIR / CCTV / WiFi)
       │  MQTT over WiFi
       ▼
Gateway scripts (Python, runs on Ubuntu VM)
       │  writes to
       ▼
MySQL database  "raaise"
       │  queried by
       ▼
Next.js dashboard  (what you'll be working on)
```

For local dev you only need the **last two layers** — MySQL + the Next.js dashboard. A SQL dump of real data is included in this bundle, so no sensors or gateway are needed.

---

## 2. Prerequisites

Install these first:

- **Docker Desktop** — <https://www.docker.com/products/docker-desktop/>
- **Node.js 18+** — <https://nodejs.org/>
- A code editor (VS Code recommended)

Verify everything is installed:

```powershell
docker --version
node --version
npm --version
```

---

## 3. Start MySQL (Docker)

Open PowerShell and run this as a **single line** (don't split it):

```powershell
docker run --name raaise-mysql -e MYSQL_ROOT_PASSWORD=raaise -e MYSQL_DATABASE=raaise -e TZ=Asia/Kolkata -p 3306:3306 -d mysql:8
```

Wait ~20 seconds for MySQL to finish booting.

> `TZ=Asia/Kolkata` matters — the dashboard filters locations by "last 30 minutes" and mismatched timezones will make it look empty.

---

## 4. Import the dump and refresh seed data

From the project root (the folder that contains this README):

```powershell
cd C:\path\to\RAAISE-MVP-3
Get-Content raaise_dump.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
Get-Content refresh_data.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
```

What these do:
- `raaise_dump.sql` — schema + real data from the production DB (24 tables).
- `refresh_data.sql` — bumps the `User_Location_Pred` and `Sensor_Status` timestamps to `NOW()` so the dashboard's "last 30 minutes" filter actually returns rows. **Re-run this whenever the dashboard goes empty** (it does, about every 30 minutes, because the data ages out).

You should see something like this at the end of the refresh:

```
metric                    value
User_Location_Pred rows   46
Sensor_Status rows        40
User_Registration rows    10
```

---

## 5. Configure the dashboard

The dashboard lives in `raaise-dashboard-wording-updated/`. It needs a `.env.local` file (already included in this bundle):

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=raaise
DB_NAME=raaise
```

If for some reason that file is missing, create it at `raaise-dashboard-wording-updated/.env.local` with those four lines.

---

## 6. Run the dashboard

```powershell
cd raaise-dashboard-wording-updated
npm install
npm run dev
```

Open <http://localhost:3000>. You should see:
- The floor plan map with **colored circles representing users** (this is what we're replacing).
- Sensor icons showing **Active / Inactive / Offline** state.
- A list of areas and messages.

If the map renders but there are no users or all sensors are Offline, re-run `refresh_data.sql` (step 4).

---

## 7. The work

**Goal:** Replace the 2D user circles on the map with a 3D avatar visualization — think Tesla's pedestrian/obstacle display. The client wants people to look like stylized 3D humanoids standing on the floor plan, not flat circles.

**Key file to start from:**
`raaise-dashboard-wording-updated/src/components/Map.tsx`

This is where users are currently rendered as circles based on `predictedLocation` lookups against a position map (A01–A17, P-codes, C01–C06). Every 5 seconds the component polls `/api/users` and re-renders. The 3D treatment should be a drop-in replacement for the circle rendering logic — the same user data, shown as 3D avatars.

**Suggested approach:**
- Use **react-three-fiber** (`@react-three/fiber` + `@react-three/drei`) — it plugs into the existing Next.js + React setup cleanly.
- Start with stylized capsule-and-head humanoids (that's actually what Tesla uses — abstract, not photoreal).
- Billboard the avatars toward the camera so they read clearly from any angle.
- Keep the existing floor plan image as the ground; layer the 3D canvas on top.
- Preserve the active/inactive/offline color states on the avatars.

**API endpoints you'll be working with:**
- `GET /api/users` — current user positions (polled every 5s by the map)
- `GET /api/areas` — active area list
- `GET /api/messages` — dashboard messages
- Swagger UI at `/api-docs` if you want to poke around.

---

## Troubleshooting

**"No users on the map, all sensors Offline"**
Re-run `refresh_data.sql` — the timestamps aged out past the 30-minute window.

**"npm run dev fails with ENOENT package.json"**
You're in the wrong folder. `cd raaise-dashboard-wording-updated` first.

**"Container name already in use"**
An old container is lingering. Kill it: `docker stop raaise-mysql; docker rm raaise-mysql` — then re-run step 3.

**"ExecutionPolicy" error when running npm**
Run once: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (answer Y).

**Port 3306 already in use**
You have another MySQL running. Either stop it, or change `-p 3306:3306` in step 3 to `-p 3307:3306` and update `DB_HOST=localhost:3307` in `.env.local`.
