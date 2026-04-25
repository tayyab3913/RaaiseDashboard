import pandas as pd
import mysql.connector
from mysql.connector import Error
from datetime import datetime
import time

def fetch_sensor_mapping(connection):
    """Fetches the sensor mapping from the Sensor_Location table in the database."""
    try:
        query = "SELECT SENSORID, LOCATION FROM Sensor_Location"
        sensor_mapping_df = fetch_data(query, connection)
        sensor_mapping = dict(zip(sensor_mapping_df['SENSORID'], sensor_mapping_df['LOCATION']))
        return sensor_mapping
    except Exception as e:
        print(f"Error fetching sensor mapping from database: {e}")
        return {}

def fetch_passage_to_area_mapping(connection):
    """Fetches the passage-to-area mapping from the Passage_Data table in the database."""
    try:
        query = "SELECT PASSAGEID, CONNECTS_TO FROM Passage_Data"
        passage_mapping_df = fetch_data(query, connection)
        passage_mapping = dict(zip(passage_mapping_df['PASSAGEID'], passage_mapping_df['CONNECTS_TO']))
        return passage_mapping
    except Exception as e:
        print(f"Error fetching passage mapping from database: {e}")
        return {}

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

def save_data_to_database(data, connection):
    """Saves or updates DataFrame records in the database."""
    try:
        cursor = connection.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS User_Location_Pred (
            USERID VARCHAR(255) NOT NULL,
            TIMESTAMP VARCHAR(255) NOT NULL,
            PREDICTED_LOCATION VARCHAR(255),
            PRIMARY KEY(USERID, TIMESTAMP)
        )
        """)
        
        sql = """
        INSERT INTO User_Location_Pred (USERID, TIMESTAMP, PREDICTED_LOCATION)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
        PREDICTED_LOCATION = IF(VALUES(PREDICTED_LOCATION) IS NOT NULL, VALUES(PREDICTED_LOCATION), PREDICTED_LOCATION)
        """
        
        data = data.sort_values(by='TIMESTAMP', ascending=False).head(50)
        for i, row in data.iterrows():
            cursor.execute(sql, (row['USERID'], row['TIMESTAMP'], row['PREDICTED_LOCATION']))
        connection.commit()
        print("Data saved or updated in database successfully.")
    except Exception as e:
        print(f"Error saving or updating data in database: {e}")

def update_active_areas(PREDICTED_LOCATION, connection):
    """Updates the timestamp in the Active_Areas table for a specific area."""
    try:
        cursor = connection.cursor()
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Fetch passage mapping dynamically
        passage_mapping = fetch_passage_to_area_mapping(connection)

        # Use mapping to update the area if PREDICTED_LOCATION matches a passage
        area_to_update = passage_mapping.get(PREDICTED_LOCATION, PREDICTED_LOCATION if PREDICTED_LOCATION.startswith('A') else None)

        # If no valid area to update is found, skip the update
        if area_to_update is None:
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
    database_connection = connect_to_database()
    if database_connection is not None:
        # Fetch the sensor and passage mappings
        sensor_mapping = fetch_sensor_mapping(database_connection)
        if not sensor_mapping:
            print("Failed to load sensor mapping.")
            return pd.DataFrame()

        user_data = fetch_data("SELECT * FROM User_Registration", database_connection)
        print("Fetched user registration data:")
        print(user_data)

        if user_data.empty:
            print("No user registration data fetched.")
            return pd.DataFrame()

        wips_data = fetch_data("SELECT * FROM WIPS_Data ORDER BY TIMESTAMP DESC LIMIT 50", database_connection)
        print("Fetched WIPS data:")
        print(wips_data)

        if wips_data.empty:
            print("No WIPS data fetched.")
            return pd.DataFrame()

        wips_data['PREDICTED_LOCATION'] = wips_data['LOCATION'].str.upper()
        wips_data = wips_data.dropna(subset=['PREDICTED_LOCATION'])

        wips_data['DEVICEID'] = wips_data['DEVICEID'].str.lower().str.strip()
        user_data['WIPSID'] = user_data['WIPSID'].str.lower().str.strip()

        results = []
        for _, wips_row in wips_data.iterrows():
            device_id = wips_row['DEVICEID']
            timestamp = wips_row['TIMESTAMP']
            predicted_location = wips_row['PREDICTED_LOCATION']

            matching_user = user_data[user_data['WIPSID'] == device_id]
            if not matching_user.empty:
                userid = matching_user['USERID'].values[0]
                results.append({'USERID': userid, 'TIMESTAMP': timestamp, 'PREDICTED_LOCATION': predicted_location})
            else:
                intruder_id = f"Intruder_{device_id}"
                print(f"No match found for DEVICEID: {device_id}. Classified as Intruder")
                results.append({'USERID': intruder_id, 'TIMESTAMP': timestamp, 'PREDICTED_LOCATION': predicted_location})

            # Logic to update Active_Areas when location starts with "A" or "P"
            if predicted_location.startswith('A') or predicted_location.startswith('P'):
                update_active_areas(predicted_location, database_connection)

        if not results:
            print("No data to save or update.")
            return pd.DataFrame()

        final_data = pd.DataFrame(results)
        save_data_to_database(final_data, database_connection)
        database_connection.close()
        return final_data

# Continuous loop to run the script
while True:
    try:
        result = predict_user_location()
        print("Prediction result:")
        print(result)

        # Sleep for a certain interval before the next iteration (e.g., 60 seconds)
        time.sleep(60)

    except Exception as e:
        print(f"Error occurred during execution: {e}")
        time.sleep(60)  # Wait for 60 seconds before retrying

