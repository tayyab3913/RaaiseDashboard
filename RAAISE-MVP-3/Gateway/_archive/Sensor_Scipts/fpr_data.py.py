import paho.mqtt.client as mqtt
import pymysql
from pymysql import Error
import datetime

# MQTT Settings
BROKER_IP = "localhost"
PORT = 1884
TOPIC = "FPR_Data"

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
    if len(sensor_data) >= 3:
        sensor_id, data, timestamp = sensor_data[:3]
        formatted_timestamp = datetime.datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S").strftime('%Y-%m-%d %H:%M:%S')
        query = f"""
        INSERT INTO FPR_Data (SensorID, Data, Timestamp)
        VALUES ('{sensor_id}', '{data}', '{timestamp}')
        """
        connection = create_connection(host, user, password, database)
        if connection:
            execute_query(connection, query)
            connection.close()


# Main function to set up MQTT client
def main():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.username_pw_set(username="raaise", password="raaise")
    client.connect(BROKER_IP, PORT)
    client.loop_start()
    input("Press Enter to stop...\n")

if __name__ == "__main__":
    main()


#$$$$$$$$$$$$ Observations from Testing the GitHub 'fpr_data.py.py' script $$$$$$$$$$$$$$$$$$$$$$
# Using the 'fpr_data.py.py' script, the three FP sensors (FP01, FP02 and FP03) are tested using User '1' fingerprint data as a subject and the following are my observations:
#   1. Issue: current script name: fpr_data.py.py
#       For consistency reasons, recommended script name: fpr_data.py
#   2. data was successfully read by each of the three feeder systems
#   3. data was successfully received by the gateway from FP01, FP02 and FP03  
#   4. data of each sensor was successfully processed and stored in the ' FPR_Data ' databse table of the 'raaise' database system.
#   5. also checked that each function defined for the 'fpr_data.py.py' script has approriate comments that can make the functions easy to understand 