# RAAISE — Live Sensor Deployment Guide

This document explains everything that must be set up on-site so the RAAISE system runs from
real hardware sensors rather than sample data. It is written for a technician or system
administrator who will be configuring the gateway server and connecting it to the sensor network.

---

## System architecture overview

```
Arduino sensors (NFC / FPR / RFID / PIR / CCTV / WiPS)
        │  sends data over WiFi via MQTT
        ▼
Ubuntu Gateway Machine
  ├── Mosquitto MQTT broker  (receives all sensor messages)
  ├── All_Sensors_V6.py      (writes raw sensor hits to MySQL)
  ├── Sensor_Status_V3.py    (tracks sensor heartbeats)
  ├── Location_Mapping_V5.py (maps sensor hits to user room locations)
  ├── Areas_Active.py        (marks rooms as occupied / empty)
  ├── Message_Display.py     (generates security alerts)
  ├── wips_data_v2.py        (handles WiFi positioning data — only if WiPS is in use)
  └── MySQL 8 database       (central data store)
        │
        ▼
Next.js Dashboard (reads from MySQL, shows 3D map + alerts)
```

The dashboard itself does **not** communicate with sensors directly. It only reads from MySQL.
All sensor processing happens in the Gateway scripts running on the Ubuntu machine.

---

## Part 1 — Ubuntu gateway machine setup

### 1.1 Install Python 3 and dependencies

```bash
sudo apt update
sudo apt install -y python3 python3-pip

pip3 install paho-mqtt pymysql mysql-connector-python pandas
```

### 1.2 Install and configure the Mosquitto MQTT broker

Mosquitto is the message broker that receives data from all the Arduino sensors.

```bash
sudo apt install -y mosquitto mosquitto-clients
```

Create the configuration file:

```bash
sudo nano /etc/mosquitto/conf.d/raaise.conf
```

Paste the following:

```
listener 1884
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Create the MQTT user account (sensors authenticate with these credentials):

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd raaise
# When prompted, enter the password: raaise
```

Restart and enable Mosquitto:

```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

Verify it is running:

```bash
sudo systemctl status mosquitto
```

> **Firewall:** If the gateway has a firewall enabled, open port 1884 so sensors on the local
> network can reach the broker:
> ```bash
> sudo ufw allow 1884/tcp
> ```

### 1.3 Install MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo mysql_secure_installation   # follow prompts; set root password to "raaise" or your chosen password
```

Create the database and set the correct timezone:

```bash
sudo mysql -uroot -p
```

Inside the MySQL prompt:

```sql
CREATE DATABASE raaise;
SET GLOBAL time_zone = '+05:30';  -- change to your local UTC offset
EXIT;
```

> The timezone must match the timezone of the gateway machine itself. The dashboard's
> "last 30 minutes" filter depends on MySQL's `NOW()` matching the timestamps the Gateway
> scripts write.

Import the database schema (one-time, first setup only):

```bash
cat raaise_dump.sql | mysql -uroot -praaise raaise
```

This creates all 24 tables with the correct schema. After this step you do **not** need to
import the dump again — the Gateway scripts will populate the tables from live sensor data.

---

## Part 2 — Copy the Gateway scripts to the server

Copy the `Gateway/` folder from the repository to the gateway machine. The six scripts that
must be running at all times are:

| Script | What it does | Run continuously? |
|---|---|---|
| `All_Sensors_V6.py` | Listens on MQTT for NFC / FPR / RFID / CCTV / PIR data and writes to `Sensor_Data` table | Yes |
| `Sensor_Status_V3.py` | Listens on MQTT for sensor heartbeat messages and updates `Sensor_Status` table | Yes |
| `Location_Mapping_V5.py` | Every 10 seconds: maps raw sensor hits to user room locations in `User_Location_Pred` | Yes |
| `Areas_Active.py` | Every 1 second: marks areas as `detect` or `no-detect` in `Active_Areas` based on recent activity | Yes |
| `Message_Display.py` | Every 5 seconds: generates security alerts in `Dashboard_Message` (intruder / unauthorised / authorised events) | Yes |
| `wips_data_v2.py` | Listens on MQTT for WiFi positioning data and writes to `WIPS_Data` table. **Only needed if WiPS sensors are deployed.** | Yes (if WiPS in use) |

---

## Part 3 — Configure the Gateway scripts

Open each script and confirm the connection details match your server:

```python
# MQTT settings (must match what you set in Mosquitto)
BROKER_IP = "localhost"   # or the IP of the Mosquitto server if it runs on a different machine
PORT = 1884
# credentials: username="raaise", password="raaise"

# Database settings
host = "localhost"
user = "root"
password = "raaise"   # change to your actual MySQL root password
database = "raaise"
```

These four values appear near the top of every Gateway script. If you changed the MySQL password
during setup (recommended), update it in all six scripts before running them.

---

## Part 4 — Configure the Arduino sensors

Each Arduino sensor must be configured to:

1. Connect to the same WiFi network as the gateway machine.
2. Send MQTT messages to the gateway machine's IP address on port 1884.
3. Authenticate with username `raaise` and password `raaise`.

The MQTT topic each sensor type publishes to:

| Sensor type | MQTT topic |
|---|---|
| NFC reader | `NFC_Data` |
| Fingerprint reader | `FPR_Data` |
| RFID reader | `RFID_Data` |
| PIR motion sensor | `PIR_Data` |
| CCTV / camera | `CAM_Data` |
| Sensor heartbeat | `Sensor_Status` |
| WiPS (WiFi positioning) | `raaise-01-10/location/#` |

The payload format expected by `All_Sensors_V6.py` is:
```
SENSORID;DATA;TIMESTAMP
```
Where `TIMESTAMP` is in the format `DD/MM/YYYY HH:MM:SS` or `YYYY-MM-DDTHH:MM:SS`.

The firmware for each sensor type is in the `Feeder Systems/` folder of this repository
(`.ino` files). The broker IP address in each firmware file must be updated to the gateway
machine's IP address before flashing.

---

## Part 5 — Run the Gateway scripts as background services

The scripts must keep running permanently. Use systemd to manage them so they start
automatically on boot and restart if they crash.

### Create a systemd service for each script

Replace `PATH_TO_GATEWAY` with the actual path where you placed the Gateway scripts
(e.g. `/home/ubuntu/raaise/Gateway`).

**Example: All_Sensors_V6.py**

```bash
sudo nano /etc/systemd/system/raaise-all-sensors.service
```

```ini
[Unit]
Description=RAAISE All Sensors MQTT Listener
After=network.target mosquitto.service mysql.service

[Service]
ExecStart=/usr/bin/python3 /PATH_TO_GATEWAY/All_Sensors_V6.py
WorkingDirectory=/PATH_TO_GATEWAY
Restart=always
RestartSec=5
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Repeat this for each script, creating one `.service` file per script. Use these service names:

| Script | Suggested service name |
|---|---|
| `All_Sensors_V6.py` | `raaise-all-sensors.service` |
| `Sensor_Status_V3.py` | `raaise-sensor-status.service` |
| `Location_Mapping_V5.py` | `raaise-location-mapping.service` |
| `Areas_Active.py` | `raaise-areas-active.service` |
| `Message_Display.py` | `raaise-message-display.service` |
| `wips_data_v2.py` | `raaise-wips-data.service` (if WiPS is used) |

Enable and start all services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable raaise-all-sensors raaise-sensor-status raaise-location-mapping raaise-areas-active raaise-message-display
sudo systemctl start  raaise-all-sensors raaise-sensor-status raaise-location-mapping raaise-areas-active raaise-message-display
```

Check they are all running:

```bash
sudo systemctl status raaise-all-sensors raaise-sensor-status raaise-location-mapping raaise-areas-active raaise-message-display
```

All five should show `active (running)`.

---

## Part 6 — Run the dashboard

Follow the steps in `LINUX_SETUP.md` to install Node.js and start the dashboard. The only
difference from the dev setup is:

- **Do not import `raaise_dump.sql`** — the schema was already imported in Part 1.3 above.
- **Do not run `refresh_data.sql`** — it is not needed with live sensors.
- The `.env.local` file should point to `localhost` if the dashboard runs on the same machine
  as MySQL, or to the gateway machine's IP address if it runs on a separate server.

For production, run the dashboard with pm2 as described in `LINUX_SETUP.md`.

---

## Part 7 — Verifying the system is working end-to-end

Once everything is running, verify each layer in order:

### Check Mosquitto is receiving sensor messages

```bash
mosquitto_sub -h localhost -p 1884 -u raaise -P raaise -t '#' -v
```

You should see messages appear as sensors transmit data. If nothing appears, check the sensor
WiFi connection and broker IP address in the sensor firmware.

### Check MySQL is receiving data

```bash
mysql -uroot -praaise raaise -e "SELECT * FROM Sensor_Data ORDER BY TIMESTAMP DESC LIMIT 5;"
mysql -uroot -praaise raaise -e "SELECT * FROM User_Location_Pred ORDER BY TIMESTAMP DESC LIMIT 5;"
```

Rows should appear and timestamps should be recent (within the last few minutes).

### Check the dashboard

Open the dashboard at `http://<gateway-ip>:3000`. You should see:
- Sensor icons showing **Active** status (green) for sensors that have transmitted recently.
- User avatars appearing on the 3D map as sensor hits are processed by `Location_Mapping_V5.py`.
- Security alerts appearing in the Notifications panel as users are detected.

If sensor icons show **Offline** but `Sensor_Data` has recent rows, check that
`Sensor_Status_V3.py` is running and receiving heartbeat messages on the `Sensor_Status` topic.

---

## Debug mode (dashboard only)

The dashboard has a **Debug** button in the top toolbar. When enabled:
- Avatars wander the map automatically so you can test the visual without needing sensor data.
- Four mock notifications are shown (Critical / High / Medium / Low) so you can verify the
  notifications UI.
- Live API polling is paused — the map will not update from real data while debug is on.

**Always turn Debug off before handing the system to end users.** It is a development/testing
tool only.

---

## Security notes before going live

1. **Change the default passwords.** The default MySQL password (`raaise`) and MQTT password
   (`raaise`) are the same as the database name and should be changed before production
   deployment. Update them in all six Gateway scripts and in `raaise-dashboard-wording-updated/.env.local`.

2. **Do not expose MySQL port 3306 to the internet.** It should only be reachable from
   `localhost` or the local network.

3. **Do not expose port 1884 to the internet.** Mosquitto should only be reachable from the
   local sensor network.

4. **Put the dashboard behind a reverse proxy** (e.g. nginx) with HTTPS if it needs to be
   accessible outside the local network.
