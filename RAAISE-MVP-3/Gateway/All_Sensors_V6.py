import paho.mqtt.client as mqtt
import pymysql
from pymysql import Error
import datetime
import logging
import os
import time
 
# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
 
# MQTT Settings
BROKER_IP = "localhost"
PORT = 1884
TOPICS = ["NFC_Data", "FPR_Data", "RFID_Data", "CAM_Data", "PIR_Data"]
 
# Database connection details
host = "localhost"
user = "root"
password = os.getenv("DB_PASSWORD", "raaise")
database = "raaise"
 
# Function to create database connection
def create_connection(host_name, user_name, user_password, db_name):
    try:
        connection = pymysql.connect(
            host=host_name,
            user=user_name,
            password=user_password,
            database=db_name,
            cursorclass=pymysql.cursors.DictCursor
        )
        logging.info("Database connection successful")
        return connection
    except Error as e:
        logging.error(f"Error while connecting to database: '{e}'")
        return None
 
# Function to execute a query
def execute_query(connection, query, data_tuple):
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, data_tuple)
            connection.commit()
            logging.info("Data inserted successfully")
    except Error as e:
        logging.error(f"Error while executing query: '{e}'")
 
# Callback function when client connects to MQTT broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logging.info("Connected successfully to MQTT broker.")
        for topic in TOPICS:
            client.subscribe(topic)
    else:
        logging.error(f"Failed to connect to MQTT broker, return code {rc}")
 
# Callback function when a message is received
def on_message(client, userdata, msg):
    payload = msg.payload.decode()
    logging.info(f"Received {payload} from {msg.topic}")
    
    Sensor_Data = payload.split(';')
    if len(Sensor_Data) >= 3:
        sensor_id, data, timestamp = Sensor_Data[:3]
        # Attempt to parse the timestamp with multiple formats
        timestamp_formats = ["%d/%m/%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]
        formatted_timestamp = None
        for fmt in timestamp_formats:
            try:
                formatted_timestamp = datetime.datetime.strptime(timestamp, fmt).strftime('%Y-%m-%d %H:%M:%S')
                break
            except ValueError:
                continue
        if formatted_timestamp is None:
            logging.error(f"Failed to parse timestamp: '{timestamp}'")
            return

        # Insert into the generic Sensor_Data table
        query_sensor_data = """
        INSERT INTO Sensor_Data (SENSORID, DATA, TIMESTAMP)
        VALUES (%s, %s, %s)
        """
        data_tuple = (sensor_id, data, formatted_timestamp)
        
        connection = create_connection(host, user, password, database)
        if connection:
            try:
                # Insert into the generic Sensor_Data table
                execute_query(connection, query_sensor_data, data_tuple)

                # Insert into the sensor-specific table only if it's not from PIR_Data
                if msg.topic != "PIR_Data":
                    table_name = msg.topic
                    if msg.topic == "FPR_Data":
                        # Concatenate SensorID and User for FPR_Data
                        data = f"{sensor_id}u{data}"
                        query_topic_specific = f"""
                        INSERT INTO {table_name} (SENSORID, DATA, TIMESTAMP)
                        VALUES (%s, %s, %s)
                        """
                        data_tuple = (sensor_id, data, formatted_timestamp)  # Update tuple with new concatenated data
                    else:
                        query_topic_specific = f"""
                        INSERT INTO {table_name} (SENSORID, DATA, TIMESTAMP)
                        VALUES (%s, %s, %s)
                        """
                    execute_query(connection, query_topic_specific, data_tuple)
                    
            finally:
                connection.close()

# Main function to set up MQTT client
def main():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.username_pw_set(username="raaise", password="raaise")
    client.connect(BROKER_IP, PORT)
    client.loop_start()
 
    try:
        while True:
            time.sleep(1)  # Sleep to avoid high CPU usage
    except KeyboardInterrupt:
        logging.info("Disconnecting from MQTT broker...")
        client.loop_stop()
        client.disconnect()
 
if __name__ == "__main__":
    main()