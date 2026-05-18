# _archive

This folder contains files that are no longer part of the active codebase but are kept for reference.
Nothing here is needed to run the system. Do not import or run these files in production.

---

## RAAISE-FIND3/

**What it is:** Data files from the FIND3 WiFi Indoor Positioning System — trained model files
(`.find3.ai`) and SQLite databases (`.sqlite3.db`) for several device sessions.

**Why archived:** FIND3 was used during an earlier phase to derive room-level positions from
WiFi signal fingerprints. It is not directly integrated with the current dashboard. The active
WiPS pipeline (`Gateway/wips_data_v2.py`) receives pre-processed location results over MQTT and
writes them to MySQL; it does not read these files at runtime.

**If WiPS is re-enabled:** These model files would need to be loaded by a running FIND3 server
instance on the gateway machine. The FIND3 server is a separate Go binary and is not included
in this repository.

---

## Gateway/_archive/Sensor_Scipts/

**What it is:** Individual per-sensor MQTT listener scripts — one file per sensor type (NFC, FPR,
RFID, CCTV, PIR, WiPS). Each subscribed to a single MQTT topic and wrote raw data to MySQL.

**Why archived:** Superseded by `Gateway/All_Sensors_V6.py`, which handles all sensor types
(NFC, FPR, RFID, CCTV, PIR) in a single consolidated script. Running both would cause duplicate
database writes.

**Note on `fpr_data.py.py`:** This file has a double `.py` extension — it is a typo/copy error
and has never been a valid script.

---

## Gateway/_archive/Cont_Trunc_2.py

**What it is:** A database maintenance utility. Every 10 minutes it copies rows older than
2 minutes from `Sensor_Data`, `User_Location_Pred`, and `WIPS_Data` into backup tables, then
deletes them from the originals.

**Why archived:** It is not part of the core data pipeline. Whether to run it in production
is an operational decision — the system works without it, but long-running deployments will
accumulate rows in those tables without it.

**To restore:** Move back to `Gateway/` and run as a background process alongside the other
Gateway scripts if database size management is needed.

---

## Gateway/_archive/In_time_authentication_V5.1 1.py

**What it is:** A real-time access-control decision script. It subscribes to `NFC_Data` and
`FPR_Data` MQTT topics, cross-references the incoming credential against `User_Registration`,
and publishes an `Access_Control` MQTT message granting or denying access.

**Why archived:** The filename contains a version number and a space, suggesting it was a
working draft. The dashboard's current access decision logic lives inside
`Gateway/Message_Display.py` (which writes `authorized`/`unauthorized`/`intruder` events to
`Dashboard_Message`). The role of this script relative to that is unclear and it has not been
verified against the current database schema.

**To restore:** Requires review to confirm it does not conflict with `Message_Display.py`
before running alongside the other Gateway scripts.

---

## Gateway/_archive/WIPS_Location_Mapping_V4.py

**What it is:** A WiPS-specific location mapping script (version 4). It reads from `WIPS_Data`
and maps device positions to area codes in `User_Location_Pred`.

**Why archived:** `Gateway/Location_Mapping_V5.py` (the active script) already handles `WP`-
prefixed sensor IDs and writes to `User_Location_Pred`. Running both would produce duplicate or
conflicting location entries.

**To restore:** If WiPS is the primary positioning method and `Location_Mapping_V5.py` proves
inadequate for WiPS data, restore and run this in place of (not alongside) V5 for WiPS sources.
