import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})


export async function getSensors() {
  const [rows] = await pool.query(`
    SELECT 
      ss.SENSORID, 
      ss.TIMESTAMP, 
      sl.LOCATION, 
      sl.CONTROL_ACCESS, 
      sl.CAN_AUTHENTICATE, 
      sl.ENTRY_AND_EXIT,
      fl.SECURITY_LEVEL
    FROM Sensor_Status ss
    JOIN Sensor_Location sl ON ss.SENSORID = sl.SENSORID
    LEFT JOIN Facility_Layout fl ON sl.LOCATION = fl.AREAID
  `)
  return rows as {
    SENSORID: string,
    TIMESTAMP: string,
    LOCATION: string,
    CONTROL_ACCESS: string,
    CAN_AUTHENTICATE: string,
    ENTRY_AND_EXIT: string,
    SECURITY_LEVEL: string | null
  }[]
}

export async function getUsers() {
  const [rows] = await pool.query(`
    SELECT 
      ulp.USERID, 
      ulp.TIMESTAMP, 
      ulp.PREDICTED_LOCATION,
      CASE WHEN ur.USERID IS NOT NULL THEN TRUE ELSE FALSE END AS IS_REGISTERED,
      ur.ACCESS_LEVEL
    FROM User_Location_Pred ulp
    LEFT JOIN User_Registration ur ON ulp.USERID = ur.USERID
    WHERE ulp.TIMESTAMP >= NOW() - INTERVAL 30 MINUTE
  `)
  return rows as {
    USERID: string,
    TIMESTAMP: string,
    PREDICTED_LOCATION: string,
    IS_REGISTERED: boolean,
    ACCESS_LEVEL: string | null
  }[]
}

// Function to get currently active dashboard messages
export async function getActiveMessages() {
  const [rows] = await pool.query(`
    SELECT 
      id,
      Message, 
      Counter, 
      Priority, 
      Timestamp 
    FROM Dashboard_Message 
    WHERE TIMESTAMPDIFF(SECOND, Timestamp, NOW()) <= Counter
    ORDER BY Priority DESC, Timestamp ASC
  `)
  return rows as {
    id: number,
    Message: string,
    Counter: number,
    Priority: number,
    Timestamp: string
  }[]
}


// Function to get active areas
export async function getActiveAreas() {
  const [rows] = await pool.query(`
    SELECT 
      AREAID,
      STATUS, 
      TIMESTAMP
    FROM Active_Areas
  `)
  return rows as {
    AREAID: number,
    STATUS: string,
    TIMESTAMP: string
  }[]
}

