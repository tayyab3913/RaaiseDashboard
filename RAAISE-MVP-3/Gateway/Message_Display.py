import pymysql
from pymysql.err import OperationalError
from datetime import datetime, timedelta
import time

# Database connection details
host = "localhost"
user = "root"
password = "raaise"
database = "raaise"

# Dictionary to track the latest timestamps for user detections
latest_timestamps = {}

# Function to create a database connection
def create_connection():
    try:
        connection = pymysql.connect(
            host=host,
            user=user,
            password=password,
            database=database,
            cursorclass=pymysql.cursors.DictCursor
        )
        print("Connected to MySQL database")
        return connection
    except OperationalError as e:
        print(f"Error while connecting to database: '{e}'")
        return None

# Function to fetch user access levels from the User_Registration table
def fetch_user_access_levels(connection):
    query = "SELECT USERID, ACCESS_LEVEL FROM User_Registration"
    user_access_levels = {}
    with connection.cursor() as cursor:
        cursor.execute(query)
        results = cursor.fetchall()
        for row in results:
            if row['ACCESS_LEVEL'] is not None:
                user_access_levels[str(row['USERID'])] = int(row['ACCESS_LEVEL'])
            else:
                print(f"Warning: User {row['USERID']} has no access level set. Skipping user.")
    return user_access_levels

# Function to fetch facility security levels from the Facility_Layout table
def fetch_facility_security_levels(connection):
    query = "SELECT AREAID, SECURITY_LEVEL FROM Facility_Layout"
    facility_security_levels = {}
    with connection.cursor() as cursor:
        cursor.execute(query)
        results = cursor.fetchall()
        for row in results:
            facility_security_levels[row['AREAID']] = int(row['SECURITY_LEVEL'])
    return facility_security_levels

# Function to fetch user location data
def get_user_location_data(connection):
    query = "SELECT USERID, PREDICTED_LOCATION, TIMESTAMP FROM User_Location_Pred ORDER BY TIMESTAMP DESC"
    with connection.cursor() as cursor:
        cursor.execute(query)
        result = cursor.fetchall()
    return result

# Function to check access based on AL and SL
def check_access(user_access_levels, facility_security_levels, userid, area_code):
    user_al = user_access_levels.get(str(userid), -1)  # Default to -1 if user not found
    area_sl = facility_security_levels.get(area_code, -1)  # Default to -1 if area not found
    if user_al == -1:
        return 'intruder'  # User not registered
    elif user_al >= area_sl:
        return 'authorized'  # User has access
    else:
        return 'unauthorized'  # User does not have access

# Function to insert or update messages in the Dashboard_Message table
def insert_message(connection, message, priority, counter):
    current_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    query_check = "SELECT id FROM Dashboard_Message WHERE Message = %s"
    with connection.cursor() as cursor:
        cursor.execute(query_check, (message,))
        result = cursor.fetchone()
        if result:
            # Update the message timestamp if it already exists
            update_query = "UPDATE Dashboard_Message SET Counter = %s, Timestamp = %s, Priority = %s WHERE id = %s"
            cursor.execute(update_query, (counter, current_timestamp, priority, result['id']))
        else:
            # Insert a new message if it doesn't exist
            insert_query = "INSERT INTO Dashboard_Message (Message, Counter, Priority, Timestamp) VALUES (%s, %s, %s, %s)"
            cursor.execute(insert_query, (message, counter, priority, current_timestamp))
        connection.commit()

# Function to clear messages older than 2 minutes (120 seconds)
def clear_old_messages(connection):
    current_time = datetime.now()
    cutoff_time = current_time - timedelta(minutes=2)  # 2 minutes ago
    cutoff_time_str = cutoff_time.strftime('%Y-%m-%d %H:%M:%S')

    print(f"Clearing messages older than {cutoff_time_str}")
    delete_query = "DELETE FROM Dashboard_Message WHERE Timestamp < %s"
    with connection.cursor() as cursor:
        cursor.execute(delete_query, (cutoff_time_str,))
        connection.commit()

# Main function to check for new events and update messages
def check_for_events():
    connection = create_connection()
    if not connection:
        return
    
    while True:
        # Fetch the user access levels from the User_Registration table
        user_access_levels = fetch_user_access_levels(connection)
        
        # Fetch the facility security levels from the Facility_Layout table
        facility_security_levels = fetch_facility_security_levels(connection)

        # Fetch the latest user locations
        user_locations = get_user_location_data(connection)

        current_time = time.time()

        # Track new detections for users
        for user_location in user_locations:
            userid = user_location['USERID']
            user_loc = user_location['PREDICTED_LOCATION']
            user_time = datetime.strptime(user_location['TIMESTAMP'], '%Y-%m-%d %H:%M:%S').timestamp()

            # Check for missing or invalid data
            if userid is None or user_loc is None:
                continue  # Skip this entry if data is missing
            
            # Only process if it's new data (timestamp > latest stored timestamp)
            if userid not in latest_timestamps or user_time > latest_timestamps[userid]:
                latest_timestamps[userid] = user_time

                # Check access status for the user in the current location
                access_status = check_access(user_access_levels, facility_security_levels, userid, user_loc)

                # Authorized user detection
                if access_status == 'authorized':
                    message = f"User {userid} detected in Area {user_loc}"
                    insert_message(connection, message, priority=1, counter=2)

                # Unauthorized user detection
                elif access_status == 'unauthorized':
                    message = f"Unauthorized User {userid} detected in Area {user_loc}"
                    insert_message(connection, message, priority=2, counter=5)

                # Intruder detection
                elif access_status == 'intruder':
                    message = f"Intruder detected in {user_loc}"
                    insert_message(connection, message, priority=4, counter=30)

        # Clear old messages older than 2 minutes
        clear_old_messages(connection)

        # Sleep for a while before checking again (adjust the interval as needed)
        time.sleep(5)

if __name__ == "__main__":
    check_for_events()



