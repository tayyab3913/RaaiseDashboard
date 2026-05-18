
#!/bin/bash
sourceBROKER="localhost" # 192.168.15.13  192.168.15.19   10.0.2.15
destBROKER="raaise.local" #"192.168.15.10"
model="raaise-01-10"

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
#Subscribe to topic
  mosquitto_sub -h $sourceBROKER -t "${model}/location/#" -u raaise-01-10 -P 9maff -p 1884 -v | while read -r topic message
  do
    # This is a callback to be executed every time a client subscribes to a top$
    newtopic="$(cut -d'/' -f3 <<<$topic)"
    echo "MQTT client subscribed to ${newtopic}"

    echo $message
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
    mosquitto_pub -h $destBROKER -t "${model}/location/${newtopic}" -m "$combined_data" -u raaise -P raaise -p 1884
    #fi
  done
  sleep 5 # Wait 5 seconds until reconnection
done
