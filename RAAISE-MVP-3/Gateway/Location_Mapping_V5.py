import pandas as pd
import mysql.connector
from mysql.connector import Error
from datetime import datetime
import time

def connect_to_database():
    """Connects to the MySQL database and returns the connection object."""
    try:
        connection = mysql.connector.connect(
            host='localhost',        # database host
            database='raaise',       # database name
            user='root',             # database username
            password='raaise'        # database password
        )
        if connection.is_connected():
            print('Connected to MySQL database')
            return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

def fetch_data(query, connection):
    """Fetches data from the database using a SQL query."""
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query)
        result = cursor.fetchall()
        return pd.DataFrame(result)
    except Error as e:
        print(f"Error fetching data: {e}")
        return pd.DataFrame()

def fetch_passage_to_area_mapping(connection):
    """Fetches passage to area mapping from the Passage_Data table in the database."""
    try:
        query = "SELECT PASSAGEID, CONNECTS_FROM FROM Passage_Data"
        mapping_data = fetch_data(query, connection)
        # Convert the mapping data to a dictionary for quick lookup
        passage_to_area_mapping = dict(zip(mapping_data['PASSAGEID'], mapping_data['CONNECTS_FROM']))
        return passage_to_area_mapping
    except Error as e:
        print(f"Error fetching passage to area mapping: {e}")
        return {}

def save_data_to_database(data, connection):
    """Saves or updates DataFrame records in the database."""
    try:
        cursor = connection.cursor()
        # Ensure the table exists with the correct schema and unique constraints
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS User_Location_Pred (
            USERID VARCHAR(255),
            TIMESTAMP VARCHAR(255),
            PREDICTED_LOCATION VARCHAR(255),
            PRIMARY KEY(USERID, TIMESTAMP)
        )
        """)

        # Insert or update records
        sql = """
        INSERT INTO User_Location_Pred (USERID, TIMESTAMP, PREDICTED_LOCATION)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
        PREDICTED_LOCATION = VALUES(PREDICTED_LOCATION)
        """
        for i, row in data.iterrows():
            cursor.execute(sql, (row['USERID'], row['TIMESTAMP'], row['PREDICTED_LOCATION']))
        connection.commit()
        print("Data saved or updated in database successfully.")
    except Exception as e:
        print(f"Error saving or updating data in database: {e}")

def update_active_areas(PREDICTED_LOCATION, sensor_id, connection):
    """Updates the timestamp in the Active_Areas table for a specific area, but skips updates for PS sensors."""
    try:
        cursor = connection.cursor()
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Skip update if the sensor is a PS sensor
        if sensor_id.startswith('PS'):
            print(f"Skipping update for PS sensor: {sensor_id}")
            return

        # Fetch passage to area mapping from the Passage_Data table
        passage_to_area_mapping = fetch_passage_to_area_mapping(connection)

        # Use mapping to update the area if PREDICTED_LOCATION matches a passage
        area_to_update = passage_to_area_mapping.get(PREDICTED_LOCATION, PREDICTED_LOCATION if PREDICTED_LOCATION.startswith('A') else None)

        # If no valid area to update is found, skip the update
        if area_to_update is None:
            print(f"No valid area to update for location: {PREDICTED_LOCATION}")
            return

        # Update only the Timestamp for existing entries in Active_Areas
        cursor.execute("""
        UPDATE Active_Areas 
        SET TIMESTAMP = %s 
        WHERE AREAID = %s
        """, (current_time, area_to_update))
        connection.commit()
        print(f"Updated Active_Areas for {area_to_update} with TIMESTAMP {current_time}.")
    except Exception as e:
        print(f"Error updating Active_Areas table: {e}")

def predict_user_location():
    """Predicts user location based on sensor and user registration data."""
    # Connect to the database
    database_connection = connect_to_database()
    if database_connection is not None:
        # Fetch the latest 100 rows from the sensor_data table
        Sensor_Data = fetch_data("SELECT * FROM Sensor_Data ORDER BY TIMESTAMP DESC LIMIT 100", database_connection)

        if Sensor_Data.empty:
            print("No sensor data fetched.")
            return pd.DataFrame()

        user_data = fetch_data("SELECT * FROM User_Registration", database_connection)

        if user_data.empty:
            print("No user registration data fetched.")
            return pd.DataFrame()

        # Fetch sensor locations from the database
        sensor_location_query = "SELECT SENSORID, LOCATION FROM Sensor_Location"
        sensor_locations = fetch_data(sensor_location_query, database_connection)

        # Merge sensor data with sensor locations
        Sensor_Data = Sensor_Data.merge(sensor_locations, on='SENSORID', how='left').dropna(subset=['LOCATION'])
        Sensor_Data.rename(columns={'LOCATION': 'PREDICTED_LOCATION'}, inplace=True)

        results = []
        for _, sensor_row in Sensor_Data.iterrows():
            sensor_id = sensor_row['SENSORID']
            sensor_value = sensor_row['DATA']
            timestamp = sensor_row['TIMESTAMP']
            predicted_location = sensor_row['PREDICTED_LOCATION']

            # Determine the column name based on the sensor ID
            if sensor_id.startswith('NF'):
                column_name = 'NFCID'
            elif sensor_id.startswith('RF'):
                column_name = 'RFIDID'
            elif sensor_id.startswith('FP'):
                column_name = 'FPRID'
            elif sensor_id.startswith('WP'):
                column_name = 'WIPSID'
            elif sensor_id.startswith('CC'):
                column_name = 'CCTVID'
            else:
                column_name = None

            if column_name:
                # Check for the user data that matches the sensor value
                matching_user = user_data[user_data[column_name].str.strip() == sensor_value.strip()]
                if not matching_user.empty:
                    user_id = matching_user['USERID'].values[0]
                else:
                    user_id = f"Intruder_{sensor_id}_{sensor_value}"
            else:
                user_id = f"Intruder_{sensor_id}_{sensor_value}"

            results.append({'USERID': user_id, 'TIMESTAMP': timestamp, 'PREDICTED_LOCATION': predicted_location})

            # Update Active_Areas if the location starts with "A" or "P"
            if predicted_location.startswith('A') or predicted_location.startswith('P'):
                print(f"Updating active areas for sensor {sensor_id} and location {predicted_location}.")
                update_active_areas(predicted_location, sensor_id, database_connection)
            else:
                print(f"Skipping update for sensor {sensor_id} with location {predicted_location}.")

        if not results:
            print("No matching data found between sensor_data and User_Registration.")
            return pd.DataFrame()

        final_data = pd.DataFrame(results)
        save_data_to_database(final_data, database_connection)  # Save or update the data to the database
        database_connection.close()
        return final_data

# Main loop to continuously run the prediction task
def run_continuously(interval_seconds=10):
    """Runs the prediction task continuously every interval_seconds."""
    while True:
        print("Running prediction task...")
        result = predict_user_location()
        print("Prediction result:")
        print(result)
        print(f"Waiting for {interval_seconds} seconds before next run...\n")
        time.sleep(interval_seconds)

# Run the continuous prediction loop with a 60-second interval
run_continuously(10)
