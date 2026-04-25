-- Refreshes the imported raaise dump so the dashboard has something to render.
-- Run this AFTER importing raaise_dump.sql into the `raaise` database.
--
-- What this does:
--   1. Populates User_Location_Pred (empty in the dump) with the most
--      recent position per user from User_Location_Pred_Backup.
--   2. Bumps all User_Location_Pred timestamps to NOW() so the dashboard's
--      "last 30 minutes" filter actually returns rows.
--   3. Bumps all Sensor_Status timestamps to NOW() so sensors render as
--      "Active" instead of "Offline" on the map.

USE raaise;

-- 1. Reset and repopulate User_Location_Pred with the latest known location per user.
TRUNCATE TABLE User_Location_Pred;

INSERT INTO User_Location_Pred (USERID, TIMESTAMP, PREDICTED_LOCATION)
SELECT USERID, NOW() AS TIMESTAMP, PREDICTED_LOCATION
FROM (
  SELECT USERID, PREDICTED_LOCATION, TIMESTAMP,
         ROW_NUMBER() OVER (PARTITION BY USERID ORDER BY TIMESTAMP DESC) AS rn
  FROM User_Location_Pred_Backup
) t
WHERE rn = 1;

-- 2. Make every sensor look like it just reported in.
UPDATE Sensor_Status SET TIMESTAMP = NOW();

-- 3. Sanity check — prints what the dashboard will see.
SELECT 'User_Location_Pred rows'     AS metric, COUNT(*) AS value FROM User_Location_Pred
UNION ALL
SELECT 'Sensor_Status rows',                    COUNT(*)          FROM Sensor_Status
UNION ALL
SELECT 'User_Registration rows',                COUNT(*)          FROM User_Registration;
