# RAAISE Dashboard — Linux (Ubuntu) Setup Guide

This guide gets the RAAISE dashboard running on an Ubuntu machine using real data from the
MySQL database. Follow this guide whether you are setting up a development environment or
preparing the server that will host the live dashboard.

---

## Prerequisites

Install the following on the Ubuntu machine:

### 1. Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER   # lets you run docker without sudo (re-login after this)
```

Verify:
```bash
docker --version
```

### 2. Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:
```bash
node --version   # should print v18.x.x or higher
npm --version
```

### 3. Git (if not already installed)

```bash
sudo apt install -y git
```

---

## Step 1 — Clone the repository

```bash
git clone <your-repo-url> raaise
cd raaise/RAAISE-MVP-3
```

Replace `<your-repo-url>` with the actual GitHub URL.

---

## Step 2 — Start MySQL in Docker

Run this once to create the container:

```bash
docker run \
  --name raaise-mysql \
  -e MYSQL_ROOT_PASSWORD=raaise \
  -e MYSQL_DATABASE=raaise \
  -e TZ=Asia/Kolkata \
  -p 3306:3306 \
  -d mysql:8
```

> **Timezone matters.** The dashboard filters user locations by "last 30 minutes". If the
> MySQL timezone does not match the gateway machine's timezone, the map will appear empty even
> when data is present. Set `TZ` to match your facility's local timezone (e.g. `Asia/Kolkata`,
> `Asia/Dubai`, `Europe/London`).

Wait about 20 seconds for MySQL to finish initialising, then verify it is running:

```bash
docker ps
```

You should see `raaise-mysql` with status `Up`.

### Starting MySQL after a reboot

The container stops when the machine reboots. Start it again with:

```bash
docker start raaise-mysql
```

To make it start automatically on boot:

```bash
docker update --restart unless-stopped raaise-mysql
```

---

## Step 3 — Import the database schema

> **For development only (no live sensors):** Import the included sample dump so the dashboard
> has data to display. Skip this step in production — the Gateway scripts will create and
> populate the tables from live sensor data.

```bash
# From the project root (RAAISE-MVP-3/)
cat raaise_dump.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
```

### Refreshing sample data (development only)

The sample dump contains timestamps that age out. Any time the dashboard appears empty, run:

```bash
cat refresh_data.sql | docker exec -i raaise-mysql mysql -uroot -praaise raaise
```

You do **not** need this step in production — live sensors write fresh timestamps continuously.

---

## Step 4 — Configure the dashboard

The dashboard reads database credentials from a `.env.local` file. Create it if it does not
already exist:

```bash
cat > raaise-dashboard-wording-updated/.env.local << 'EOF'
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=raaise
DB_NAME=raaise
EOF
```

> In production you should replace these with your actual database credentials and ensure the
> `.env.local` file is not committed to version control.

---

## Step 5 — Install dependencies and start the dashboard

```bash
cd raaise-dashboard-wording-updated
npm install
npm run dev
```

The dashboard will be available at **http://localhost:3000**.

---

## Running in production (no dev server)

For a live deployment, build an optimised production bundle instead of running the dev server:

```bash
cd raaise-dashboard-wording-updated
npm install
npm run build
npm start
```

`npm start` runs the built app on port 3000. To keep it running after you close the terminal,
use a process manager:

```bash
# Install pm2 once
sudo npm install -g pm2

# Start the dashboard
pm2 start npm --name "raaise-dashboard" -- start

# Make pm2 restart the dashboard on reboot
pm2 save
pm2 startup   # follow the printed command to enable the systemd service
```

---

## Summary — commands to run every time after a reboot

```bash
# 1. Start MySQL
docker start raaise-mysql

# 2. Start the dashboard (if using pm2 with startup enabled, this happens automatically)
cd /path/to/RAAISE-MVP-3/raaise-dashboard-wording-updated
npm start
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot connect to Docker daemon` | Run `sudo systemctl start docker` or re-login after `usermod -aG docker` |
| `Error: No such container: raaise-mysql` | Container was deleted — re-run the `docker run` command in Step 2, then re-import the dump |
| Map is empty / no users shown | Re-run `refresh_data.sql` (dev) or check that Gateway scripts are running (production) |
| Port 3306 already in use | Another MySQL is running. Stop it with `sudo systemctl stop mysql`, or change `-p 3306:3306` to `-p 3307:3306` and set `DB_HOST=localhost:3307` in `.env.local` |
| `ENOENT: package.json` | You are in the wrong directory — `cd raaise-dashboard-wording-updated` first |
| Dashboard shows stale data | The auto-refresh interval is set too high in the UI — lower it, or click Refresh manually |
