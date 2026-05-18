
#!/bin/bash
sourceBROKER="10.0.0.17" # 192.168.15.13  192.168.15.19   10.0.2.15
destBROKER="raaise.local" #"192.168.15.10"
while true
do
#Subscribe to topic
  mosquitto_sub -h $sourceBROKER -t 'raaise-18-09/location/#' -u raaise-18-09 -P 1bp3t -p 1884 -v | while read -r topic message
  do
    # This is a callback to be executed every time a client subscribes to a top$
    newtopic="$(cut -d'/' -f3 <<<$topic)"
    echo "MQTT client subscribed to ${newtopic}"
    # Check topic and redirect the subscription
    #if [ "$topic" == 'raaise-mvp/location/18:69:d4:55:0e:53' ]; then
    # Publish message to new broker/destination (in this case is destBROKER)
    mosquitto_pub -h $destBROKER -t "raaise-mvp5-2/location/${newtopic}" -m "$message" -u raaise -P raaise -p 1884
    #fi
  done
  sleep 5 # Wait 5 seconds until reconnection
done
