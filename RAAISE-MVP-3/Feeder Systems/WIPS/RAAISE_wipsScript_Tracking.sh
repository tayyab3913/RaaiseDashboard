#!/bin/bash

sourceBROKER="localhost"
destBROKER="raaise.local"

# Function to publish "WP;Timestamp" to Sensor_Status topic every 10 seconds
publish_wp_timestamp() {
    while true; do
        # Get current timestamp
        current_timestamp=$(date +'%Y-%m-%dT%H:%M:%S')
        # Publish WP;Timestamp to Sensor_Status topic on the destination broker
        mosquitto_pub -h $destBROKER -t 'Sensor_Status' -m "WP;$current_timestamp" -u raaise -P raaise -p 1884
        sleep 10
    done
}

# Start the function in the background
publish_wp_timestamp &


while true
do
    # Subscribe to different types of MQTT topics
    mosquitto_sub -h $sourceBROKER -t 'raaise-mvp2/location/74:b0:59:73:b5:c3' -u raaise -P raaise -p 1887 -v | while read -r topic message; do     
        echo "MQTT client subscribed to ${topic}"   

        # Filter the JSON message using jq to extract desired fields from the sensors and guesses
        filtered_device=$(echo "$message" | jq -r '.sensors.d') 
        filtered_UnixTime=$(echo "$message" | jq -r '.sensors.t')
        filtered_timestamp=$(date -d "@$((filtered_UnixTime / 1000))" +'%Y-%m-%dT%H:%M:%S')       
        # Extract the guessed location from the JSON message
        filtered_location=$(echo "$message" | tail -n 1 | jq -r '.location')
        # Extract location probability associated with the guessed location
        filtered_proba=$(echo "$message" | jq -r --arg loc "$filtered_location" '.guesses[] | select(.location == $loc) | .probability')

        # Combine filtered data
        combined_data="$filtered_device;$filtered_location;$filtered_proba;$filtered_timestamp"

        # Publish the combined data to the appropriate topic on the destination broker 
        mosquitto_pub -h $destBROKER -t 'raaise-mvp2/location/74:b0:59:73:b5:c3' -m "$combined_data" -u raaise -P raaise -p 1884
    done &

    mosquitto_sub -h $sourceBROKER -t 'raaise-mvp2/location/74:b0:59:73:8b:30' -u raaise -P raaise -p 1887 -v | while read -r topic message; do     
        echo "MQTT client subscribed to ${topic}"   
        # Filter the JSON message using jq to extract desired fields from the sensors and guesses
        filtered_device=$(echo "$message" | jq -r '.sensors.d') 
        filtered_UnixTime=$(echo "$message" | jq -r '.sensors.t')
        filtered_timestamp=$(date -d "@$((filtered_UnixTime / 1000))" +'%Y-%m-%dT%H:%M:%S')
        # Extract the guessed location from the JSON message
        filtered_location=$(echo "$message" | tail -n 1 | jq -r '.location')
        #Extract location probability associated with the guessed location
        filtered_proba=$(echo "$message" | jq -r --arg loc "$filtered_location" '.guesses[] | select(.location == $loc) | .probability')
        # Combine filtered data
        combined_data="$filtered_device;$filtered_location;$filtered_proba;$filtered_timestamp"
        # Publish the combined data to the appropriate topic on the destination broker 
        mosquitto_pub -h $destBROKER -t 'raaise-mvp2/location/74:b0:59:73:8b:30' -m "$combined_data" -u raaise -P raaise -p 1884
    done &


    mosquitto_sub -h $sourceBROKER -t 'raaise-mvp2/location/74:b0:59:73:b6:71' -u raaise -P raaise -p 1887 -v | while read -r topic message; do     
        echo "MQTT client subscribed to ${topic}"
        # Filter the JSON message using jq to extract desired fields from the sensors and guesses
        filtered_device=$(echo "$message" | jq -r '.sensors.d') 
        filtered_UnixTime=$(echo "$message" | jq -r '.sensors.t')
        filtered_timestamp=$(date -d "@$((filtered_UnixTime / 1000))" +'%Y-%m-%dT%H:%M:%S')        
        # Extract the guessed location from the JSON message
        filtered_location=$(echo "$message" | tail -n 1 | jq -r '.location')
        # Extract location probability associated with the guessed location
        filtered_proba=$(echo "$message" | jq -r --arg loc "$filtered_location" '.guesses[] | select(.location == $loc) | .probability')
        # Combine filtered data
        combined_data="$filtered_device;$filtered_location;$filtered_proba;$filtered_timestamp"
        # Publish the combined data to the appropriate topic on the destination broker 
        mosquitto_pub -h $destBROKER -t 'raaise-mvp2/location/74:b0:59:73:b6:71' -m "$combined_data" -u raaise -P raaise -p 1884
    done &

    mosquitto_sub -h $sourceBROKER -t 'raaise-mvp2/location/74:b0:59:73:8b:0c' -u raaise -P raaise -p 1887 -v | while read -r topic message; do     
        echo "MQTT client subscribed to ${topic}"   

        # Filter the JSON message using jq to extract desired fields from the sensors and guesses
        filtered_device=$(echo "$message" | jq -r '.sensors.d')
        filtered_UnixTime=$(echo "$message" | jq -r '.sensors.t')
        filtered_timestamp=$(date -d "@$((filtered_UnixTime / 1000))" +'%Y-%m-%dT%H:%M:%S')       
        # Extract the guessed location from the JSON message
        filtered_location=$(echo "$message" | tail -n 1 | jq -r '.location')
        # Extract location probability associated with the guessed location
        filtered_proba=$(echo "$message" | jq -r --arg loc "$filtered_location" '.guesses[] | select(.location == $loc) | .probability')
        # Combine filtered data
        combined_data="$filtered_device;$filtered_location;$filtered_proba;$filtered_timestamp"
        # Publish the combined data to the appropriate topic on the destination broker 
        mosquitto_pub -h $destBROKER -t 'raaise-mvp2/location/74:b0:59:73:8b:0c' -m "$combined_data" -u raaise -P raaise -p 1884
    done &

    wait # Wait for all background processes to finish
    sleep 5 
done
