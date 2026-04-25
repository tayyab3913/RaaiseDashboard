import mysql.connector
import time
from datetime import datetime, timedelta

# Database connection details
host = "localhost"
user = "root"
password = "raaise"
database = "raaise"

def update_status():
    try:
        connection = mysql.connector.connect(
            host=host,
            user=user,
            password=password,
            database=database
        )

        if connection.is_connected():
            print("Connected to the database")

        cursor = connection.cursor()

        # Set all areas to "no-detect" when the script starts
        reset_query = "UPDATE Active_Areas SET STATUS = 'no-detect'"
        cursor.execute(reset_query)
        connection.commit()
        print("All areas set to 'no-detect'")

        while True:
            current_time = datetime.now()

            # Fetch all areas and their timestamps from the database
            select_query = "SELECT AREAID, TIMESTAMP FROM Active_Areas"
            cursor.execute(select_query)
            areas = cursor.fetchall()

            for area, timestamp in areas:
                if timestamp is not None:
                    # Calculate the time difference between the current time and the stored timestamp
                    time_difference = current_time - timestamp
                    if time_difference > timedelta(seconds=30):
                        status = "no-detect"
                    else:
                        status = "detect"
                else:
                    status = "no-detect"

                # Update the status for each area
                update_query = "UPDATE Active_Areas SET STATUS = %s WHERE AREAID = %s"
                cursor.execute(update_query, (status, area))

            connection.commit()
            print("Status updated for all areas")

            time.sleep(1)  # Run the loop every 1 second

    except mysql.connector.Error as err:
        print(f"Error: {err}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
            print("Database connection closed")

if __name__ == "__main__":
    update_status()
