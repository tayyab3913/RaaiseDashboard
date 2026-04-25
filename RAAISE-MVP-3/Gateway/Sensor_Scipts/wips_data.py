import paho.mqtt.client as mqtt
import pymysql
from pymysql import Error
import datetime

# MQTT Settings
BROKER_IP = "localhost"
PORT = 1884
TOPIC = "raaise-mvp3/location/#"

# Database connection details
host = "localhost"
user = "root"
password = "raaise"
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
        print("Database connection successful")
        return connection
    except Error as e:
        print(f"Error while connecting to database: '{e}'")
        return None

# Function to execute a query
def execute_query(connection, query):
    try:
        with connection.cursor() as cursor:
            cursor.execute(query)
            connection.commit()
            print("Data inserted successfully")
    except Error as e:
        print(f"Error while executing query: '{e}'")

# Callback function when client connects to MQTT broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected successfully to MQTT broker.")
        client.subscribe(TOPIC)
    else:
        print(f"Failed to connect to MQTT broker, return code {rc}")

# Callback function when a message is received
def on_message(client, userdata, msg):
    payload = msg.payload.decode()
    print(f"Received `{payload}` from `{msg.topic}`")
    sensor_data = payload.split(';')
    if len(sensor_data) == 4:
        DEVICEID, LOCATION, PROBABILITY, TIMESTAMP  = sensor_data
        formatted_timestamp = datetime.datetime.strptime(TIMESTAMP, "%Y-%m-%dT%H:%M:%S").strftime('%Y-%m-%d %H:%M:%S')
        query = f"""
        INSERT INTO WIPS_Data (DEVICEID, PROBABILITY, TIMESTAMP, LOCATION)
        VALUES('{DEVICEID}', '{PROBABILITY}', '{formatted_timestamp}', '{LOCATION}')
        """
        connection = create_connection(host, user, password, database)
        if connection:
            try:
                execute_query(connection, query)
            finally:
                connection.close()

# Main function to set up MQTT client
def main():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.username_pw_set(username="raaise", password="raaise")
    client.connect(BROKER_IP, PORT)
    client.loop_forever()

if __name__ == "__main__":
    main()
