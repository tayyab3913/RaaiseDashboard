import mysql.connector
from mysql.connector import Error
import time

# Define the cleanup interval in seconds (default to 10 minutes)
CLEANUP_INTERVAL_SECONDS = 600  # 10 minutes = 600 seconds
DELAY_BETWEEN_TABLES_SECONDS = 120  # Delay between table backups (2 minutes = 120 seconds)

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

def create_backup_table(cursor, original_table, backup_table):
    """Creates a backup table if it doesn't exist."""
    try:
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {backup_table} LIKE {original_table}
        """)
        print(f"Backup table {backup_table} created or already exists.")
    except Error as e:
        print(f"Error creating backup table {backup_table}: {e}")

def copy_and_delete_old_data(cursor, original_table, backup_table, timestamp_column):
    """Copies and deletes data older than 2 minutes from the original table."""
    try:
        # Copy data older than 2 minutes to the backup table
        cursor.execute(f"""
        INSERT IGNORE INTO {backup_table}
        SELECT * FROM {original_table}
        WHERE {timestamp_column} < NOW() - INTERVAL 2 MINUTE
        """)
        print(f"Old data copied from {original_table} to {backup_table}.")

        # Delete the copied data from the original table
        cursor.execute(f"""
        DELETE FROM {original_table}
        WHERE {timestamp_column} < NOW() - INTERVAL 2 MINUTE
        """)
        print(f"Old data deleted from {original_table}.")
    except Error as e:
        print(f"Error copying and deleting old data from {original_table}: {e}")

def backup_and_cleanup_tables(connection):
    """Backs up and cleans up data older than 2 minutes from specified tables."""
    try:
        cursor = connection.cursor()

        # Define original and backup tables
        tables = [
            ("Sensor_Data", "Sensor_Data_Backup", "timestamp"),
            ("User_Location_Pred", "User_Location_Pred_Backup", "timestamp"),
            ("WIPS_Data", "WIPS_Data_Backup", "timestamp")
        ]

        # Process each table one by one
        for original_table, backup_table, timestamp_column in tables:
            # Create backup table if it doesn't exist
            create_backup_table(cursor, original_table, backup_table)

            # Backup and delete data older than 2 minutes
            copy_and_delete_old_data(cursor, original_table, backup_table, timestamp_column)

            # Commit the changes
            connection.commit()
            print(f"Backup and cleanup completed for {original_table}.")

            # Wait for 2 minutes between processing each table
            print(f"Waiting for {DELAY_BETWEEN_TABLES_SECONDS / 60} minutes before processing the next table...\n")
            time.sleep(DELAY_BETWEEN_TABLES_SECONDS)

    except Error as e:
        print(f"Error during backup and cleanup: {e}")
        connection.rollback()

def run_continuously():
    """Runs the backup and cleanup process continuously every CLEANUP_INTERVAL_SECONDS."""
    while True:
        print("Starting backup and cleanup process...")

        # Connect to the database
        database_connection = connect_to_database()
        if database_connection is not None:
            try:
                # Backup and cleanup tables
                backup_and_cleanup_tables(database_connection)
            except Exception as e:
                print(f"Error during the backup and cleanup process: {e}")
            finally:
                database_connection.close()

        # Wait for the specified interval before running again
        print(f"Waiting for {CLEANUP_INTERVAL_SECONDS} seconds before next backup and cleanup...\n")
        time.sleep(CLEANUP_INTERVAL_SECONDS)

if __name__ == "__main__":
    # Run the continuous backup and cleanup process
    run_continuously()
