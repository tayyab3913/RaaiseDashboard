import paho.mqtt.client as mqtt
import threading
import datetime
import logging
import time
from queue import Queue
import signal
import sys
import pymysql

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s:%(message)s')

# MQTT Settings
BROKER_IP = "localhost"
PORT = 1884
TOPIC_NFC = "NFC_Data"
TOPIC_FPR = "FPR_Data"
TOPIC_ACCESS_CONTROL = "Access_Control"

# Database connection details
host = "localhost"
user = "root"
password = "raaise"
database = "raaise"

# Define session_data as a dictionary
session_data = {}
publish_queue = Queue()
db_connection = None

def create_db_connection():
    global db_connection
    try:
        db_connection = pymysql.connect(
            host=host,
            user=user,
            password=password,
            database=database,
            cursorclass=pymysql.cursors.DictCursor
        )
        logging.info("Persistent database connection established. Code: DB_CONN_ESTABLISHED")
    except pymysql.MySQLError as e:
        logging.error(f"Error while connecting to database: {e}. Code: DB_CONN_ERROR")
        db_connection = None

def fetch_facility_layout():
    global db_connection
    query = "SELECT AREAID, SECURITY_LEVEL, INGRESS_EGRESS_POINTS FROM Facility_Layout"
    area_security_levels = {}
    passage_sensor_mapping = {}
    
    try:
        with db_connection.cursor() as cursor:
            cursor.execute(query)
            results = cursor.fetchall()
            for row in results:
                area_id = row['AREAID']
                security_level = row['SECURITY_LEVEL']
                ingress_egress_points = row['INGRESS_EGRESS_POINTS'].split(",")  # Assuming sensors are stored as a comma-separated string
                area_security_levels[area_id] = security_level
                passage_sensor_mapping[area_id] = ingress_egress_points
            logging.info(f"Fetched facility layout: {area_security_levels}, {passage_sensor_mapping}. Code: FETCH_FACILITY_LAYOUT_SUCCESS")
    except pymysql.MySQLError as e:
        logging.error(f"Error while fetching facility layout: {e}. Code: FETCH_FACILITY_LAYOUT_ERROR")
    
    return area_security_levels, passage_sensor_mapping

def fetch_user_data(credential):
    global db_connection
    query = "SELECT USERID FROM User_Registration WHERE NFCID = %s OR FPRID = %s"
    try:
        with db_connection.cursor() as cursor:
            cursor.execute(query, (credential, credential))
            result = cursor.fetchone()
            if result:
                logging.info(f"Fetched user data for credential {credential}: {result}. Code: FETCH_USER_DATA_SUCCESS")
                return result
            else:
                logging.info(f"No matching user data found for credential: {credential}. Code: FETCH_USER_DATA_NOT_FOUND")
                return None
    except pymysql.MySQLError as e:
        logging.error(f"Error while fetching user data: {e}. Code: FETCH_USER_DATA_ERROR")
        return None

def fetch_user_access_levels():
    global db_connection
    query = "SELECT USERID, ACCESS_LEVEL FROM User_Registration"
    access_levels = {}
    try:
        with db_connection.cursor() as cursor:
            cursor.execute(query)
            results = cursor.fetchall()
            for row in results:
                access_levels[row['USERID']] = row['ACCESS_LEVEL']
            logging.info(f"Fetched user access levels: {access_levels}. Code: FETCH_USER_ACCESS_LEVELS_SUCCESS")
            return access_levels
    except pymysql.MySQLError as e:
        logging.error(f"Error while fetching user access levels: {e}. Code: FETCH_USER_ACCESS_LEVELS_ERROR")
        return access_levels

def handle_passage(passage_id, sensor_data_store, sensor_type, data, timestamp, publish_queue, user_access_levels, area_security_levels):
    try:
        sensor_data_store[sensor_type] = data
        logging.info(f"[{passage_id}] Stored data for sensor {sensor_type}: {data}")

        if sensor_type in fp_to_nfc_mapping.values() or sensor_type in fp_to_nfc_mapping.keys():
            start_timeout(passage_id, sensor_data_store, sensor_type, publish_queue)
            check_combined_data(passage_id, sensor_data_store, sensor_type, publish_queue, user_access_levels, area_security_levels)
        else:
            user_data = fetch_user_data(data)
            if user_data:
                user_id = user_data["USERID"]
                access_level = user_access_levels.get(str(user_id), 0)  # Fetch the specific user's access level
                area_security_level = area_security_levels.get(passage_id, 0)
                logging.info(f"[{passage_id}] User access level: {access_level}, Area security level: {area_security_level}")
                if int(access_level) >= area_security_level:
                    publish_queue.put((passage_id, sensor_type, "Allow"))
                else:
                    publish_queue.put((passage_id, sensor_type, "Deny"))
            else:
                publish_queue.put((passage_id, sensor_type, "Deny"))
            reset_session(passage_id, sensor_data_store)
    except Exception as e:
        logging.error(f"Error in handle_passage: {e}")

def start_timeout(passage_id, sensor_data_store, sensor_type, publish_queue):
    def handle_timeout():
        if sensor_type in sensor_data_store:
            logging.info(f"[{passage_id}] Timeout occurred for {sensor_type}")
            publish_queue.put((passage_id, sensor_type, "Timeout"))
            reset_session(passage_id, sensor_data_store)

    timeout_thread = threading.Timer(10.0, handle_timeout)
    timeout_thread.start()
    sensor_data_store['timeout_thread'] = timeout_thread
    logging.info(f"[{passage_id}] Timeout timer started for {sensor_type}")

def check_combined_data(passage_id, sensor_data_store, initial_sensor_type, publish_queue, user_access_levels, area_security_levels):
    try:
        nfc_data = None
        fpr_data = None

        if initial_sensor_type in fp_to_nfc_mapping.values():
            nfc_data = sensor_data_store.get(initial_sensor_type)
            for fp, nfc in fp_to_nfc_mapping.items():
                if nfc == initial_sensor_type:
                    fpr_data = sensor_data_store.get(fp)
                    break
        elif initial_sensor_type in fp_to_nfc_mapping.keys():
            fpr_data = sensor_data_store.get(initial_sensor_type)
            corresponding_nfc = fp_to_nfc_mapping[initial_sensor_type]
            nfc_data = sensor_data_store.get(corresponding_nfc)

        logging.info(f"[{passage_id}] Checking combined data for NFC: {nfc_data}, FPR: {fpr_data}")
        if nfc_data and fpr_data:
            logging.info(f"[{passage_id}] NFC and FPR data combined successfully")
            nfc_user_data = fetch_user_data(nfc_data)
            fpr_user_data = fetch_user_data(fpr_data)
            if nfc_user_data and fpr_user_data:
                nfc_user_id = nfc_user_data["USERID"]
                fpr_user_id = fpr_user_data["USERID"]
                if nfc_user_id == fpr_user_id:
                    user_id = nfc_user_id
                    access_level = user_access_levels.get(str(user_id), 0) 
                    area_security_level = area_security_levels.get(passage_id, 0)
                    logging.info(f"[{passage_id}] User access level: {access_level}, Area security level: {area_security_level}")
                    if int(access_level) >= area_security_level:
                        publish_queue.put((passage_id, initial_sensor_type, "Allow"))
                    else:
                        publish_queue.put((passage_id, initial_sensor_type, "Deny"))
                else:
                    publish_queue.put((passage_id, initial_sensor_type, "Mismatch"))
            else:
                publish_queue.put((passage_id, initial_sensor_type, "Deny"))
            reset_session(passage_id, sensor_data_store)
        else:
            logging.info(f"[{passage_id}] Waiting for additional sensor data for {initial_sensor_type}")
    except Exception as e:
        logging.error(f"Error in check_combined_data: {e}")

def reset_session(passage_id, sensor_data_store):
    try:
        if 'timeout_thread' in sensor_data_store:
            sensor_data_store['timeout_thread'].cancel()
            logging.info(f"[{passage_id}] Timeout thread canceled")
        sensor_data_store.clear()
        logging.info(f"[{passage_id}] Session reset")
    except Exception as e:
        logging.error(f"Error in reset_session: {e}")

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logging.info("Connected successfully to MQTT broker")
        client.subscribe([(TOPIC_NFC, 0), (TOPIC_FPR, 0)])
    else:
        logging.error(f"Failed to connect to MQTT broker, return code {rc}")

def on_message(client, userdata, msg):
    payload = msg.payload.decode()
    logging.info(f"Received `{payload}` from `{msg.topic}`")
    sensor_data = payload.split(';')
    if len(sensor_data) >= 3:
        sensor_type, data, timestamp = sensor_data[:3]
        try:
            formatted_timestamp = datetime.datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S").strftime('%Y-%m-%d %H:%M:%S')
            for passage_id, sensors in passage_sensor_mapping.items():
                if sensor_type in sensors:
                    if passage_id not in session_data:
                        session_data[passage_id] = {}
                    sensor_data_store = session_data[passage_id]
                    threading.Thread(target=handle_passage, args=(passage_id, sensor_data_store, sensor_type, data, formatted_timestamp, publish_queue, user_access_levels, area_security_levels)).start()
                    logging.info(f"Message handled for passage {passage_id}")
                    break
            else:
                logging.info(f"Sensor {sensor_type} not found in any passage. Code: SENSOR_NOT_FOUND")
        except ValueError as e:
            logging.error(f"Timestamp format error: {e}")
        except Exception as e:
            logging.error(f"Error in on_message: {e}")

def process_publish_queue(client, publish_queue):
    while True:
        passage_id, sensor_type, message = publish_queue.get()
        # Only publish to NFC sensors
        corresponding_nfc = sensor_type if sensor_type.startswith("NF") else fp_to_nfc_mapping.get(sensor_type)
        if corresponding_nfc:
            formatted_message = f"{corresponding_nfc}:{message}"
            client.publish(TOPIC_ACCESS_CONTROL, formatted_message)
            logging.info(f"Published `{formatted_message}` to `{TOPIC_ACCESS_CONTROL}`")

def graceful_shutdown(signum, frame):
    logging.info("Received shutdown signal. Shutting down gracefully...")
    if db_connection:
        db_connection.close()
        logging.info("Database connection closed. Code: DB_CONN_CLOSED")
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, graceful_shutdown)
    signal.signal(signal.SIGTERM, graceful_shutdown)

    create_db_connection()

    # Fetch area security levels and sensor mappings dynamically from the database
    area_security_levels, passage_sensor_mapping = fetch_facility_layout()

    user_access_levels = fetch_user_access_levels()

    client = mqtt.Client("python_client")
    client.username_pw_set(username="raaise", password="raaise")
    client.on_connect = on_connect
    client.on_message = on_message

    logging.info(f"Connecting to MQTT broker at {BROKER_IP}:{PORT}...")
    client.connect(BROKER_IP, PORT)

    threading.Thread(target=process_publish_queue, args=(client, publish_queue), daemon=True).start()

    client.loop_forever()
