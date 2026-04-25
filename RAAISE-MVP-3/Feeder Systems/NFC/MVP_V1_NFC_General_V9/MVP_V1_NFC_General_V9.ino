// Wifi Settings
#include "WiFiS3.h"

// MQTT Settings
#include <ArduinoMqttClient.h>
WiFiClient nfcClient;
MqttClient mqttclient(nfcClient);

// Time Sync
#include "RTC.h"        // Include the RTC library
#include <NTPClient.h>  //Include the NTP library
WiFiUDP Udp;            // A UDP protocol instance
NTPClient timeClient(Udp);
#include <time.h>

// OLED display settings
#include <Wire.h>
#include <SparkFun_Qwiic_OLED.h>
QwiicNarrowOLED myOLED;
QwiicTransparentOLED stOLED;
#include <res/qw_fnt_5x7.h>

// NFC settings
#include <Wire.h>
#include "SparkFun_Qwiic_Rfid.h"
#define RFID_ADDR 0x7D  // Default I2C address
Qwiic_Rfid myRfid(RFID_ADDR);
String nfcTag = "";

// WiFi and MQTT credentials and settings
char mySSID[] = "RAAISE-TestBed";           // WiFi SSID
char myPSWD[] = "RAAISE@0107";              // WiFi password
int mqttPort = 1884;                        // MQTT Port No
const char mqtt_broker[] = "raaise.local";  // MQTT broker IP
const char userName[] = "raaise";           // MQTT username
const char userPSWD[] = "raaise";           // MQTT password

// Device Specific Settings
// **********PLEASE CHANGE BASED ON DEVICE ID**********
const char mqttTopic[] = "NFC_Data";
const char statusTopic[] = "Sensor_Status";
const char nfcClientId[] = "NF13";
const char accessControlTopic[] = "Access_Control";
// **********PLEASE CHANGE BASED ON DEVICE ID**********

// Additional Declarations
const long interval = 100;
unsigned long lastMsg = 0;

// For Status Messages
unsigned long lastStatusMsg = 0;              // For status message timing
const unsigned long STATUS_INTERVAL = 10000;  // 10 seconds

// Function to display a message on the OLED
void displayStatus(const String& message) {
  myOLED.erase();
  myOLED.setCursor(0, 0);
  myOLED.print(message);
  myOLED.display();
}

void displayfeedback(const String& message) {
  stOLED.erase();
  stOLED.setCursor(0, 0);
  stOLED.print(message);
  stOLED.display();
}


void setup() {
  Serial.begin(9600);
  Wire1.begin();  // Begin I-squared-C for the NFC

  // Initialize the OLED display
  myOLED.begin();
  myOLED.setFont(&QW_FONT_5X7);
  stOLED.begin();
  stOLED.setFont(&QW_FONT_5X7);
  displayStatus("Initializing...");
  displayfeedback("Initializing...");

  // Check if the RFID module is connected
  if (myRfid.begin(Wire1)) {
    displayStatus("RFID Connected");
  } else {
    displayStatus("RFID Fail");
    while (1)
      ;  // Stop if RFID not connected
  }
  delay(1000);

  // WiFi connection
  String WiFiMsg = "Connecting WiFi:\n" + String(mySSID);
  displayStatus(WiFiMsg);

  WiFi.begin(mySSID, myPSWD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  String WiFiConMsg = "WiFi Connected:\n" + String(mySSID);
  displayStatus(WiFiConMsg);
  delay(1000);

  // MQTT connection
  String MQTTMsg = "Starting MQTT:\n" + String(mqtt_broker) + "\nTopic: " + String(mqttTopic);
  displayStatus(MQTTMsg);

  mqttclient.setId(nfcClientId);
  mqttclient.setUsernamePassword(userName, userPSWD);
  while (!mqttclient.connect(mqtt_broker, mqttPort)) {
    delay(500);
  }
  String MQTTConMsg = "MQTT Connected:\n" + String(mqtt_broker) + "\nTopic: " + String(mqttTopic);
  displayStatus(MQTTConMsg);

  // Subscribe to the Access_Control topic
  mqttclient.subscribe(accessControlTopic);

  // Set the callback function for incoming messages
  mqttclient.onMessage(onMqttMessage);

  delay(1000);

  // Starting the RTC and connection to NTP server
  RTC.begin();
  timeClient.begin();
  timeClient.update();
  adjustForDST();

  // Device is ready
  String readyMsg = "Device Ready\nID: " + String(nfcClientId);
  displayStatus(readyMsg);
  displayfeedback("Passage Ready");
  delay(2000);
  displayfeedback("Present ID to Access Area");
}

void loop() {
  RTCTime currentTime;
  RTC.getTime(currentTime);

  nfcTag = myRfid.getTag();
  delay(100);
  mqttclient.poll();

  if (nfcTag != "000000") {
    String msg = "Card Read\nID:" + nfcTag;

    unsigned long now = millis();
    if (now - lastMsg >= interval) {
      lastMsg = now;
      String message = String(nfcClientId) + ";" + nfcTag + ";" + String(currentTime);
      mqttclient.beginMessage(mqttTopic);
      mqttclient.print(message);
      mqttclient.endMessage();
    }
    displayStatus(msg);
    delay(1000);

  } else {
    String ScanningMsg = String(nfcClientId) + ": Ready to Scan";
    displayStatus(ScanningMsg);
  }

  // Send status message every 10 seconds
  if (millis() - lastStatusMsg > STATUS_INTERVAL) {
    sendStatusMessage(currentTime);
    lastStatusMsg = millis();
    delay(100);  // Loop delay
  }
}

void sendStatusMessage(const RTCTime &currentTime) {
  String statusMessage = String(nfcClientId) + ";" + String(currentTime);
  mqttclient.beginMessage(statusTopic);
  mqttclient.print(statusMessage);
  mqttclient.endMessage();
}

void adjustForDST() {
  timeClient.update();
  auto timeZoneOffsetHours = 10; // Standard time zone offset for Australia
  auto dstOffsetHours = 1; // Daylight saving time offset for Australia
  time_t unixTime = timeClient.getEpochTime();
  struct tm *localTime = localtime(&unixTime);

  int year = localTime->tm_year + 1900;
  int month = localTime->tm_mon + 1;
  int day = localTime->tm_mday;
  int wday = localTime->tm_wday;
  int hour = localTime->tm_hour;

  // Calculate the first Sunday in October
  struct tm dstStartTime = {0};
  dstStartTime.tm_year = year - 1900;
  dstStartTime.tm_mon = 9; // October is month 9 (0-based)
  dstStartTime.tm_mday = 1;
  time_t firstDayOfOct = mktime(&dstStartTime);
  struct tm *firstOct = localtime(&firstDayOfOct);
  int dstStartDay = 1 + (7 - firstOct->tm_wday) % 7; // First Sunday

  // Calculate the first Sunday in April
  struct tm dstEndTime = {0};
  dstEndTime.tm_year = year - 1900;
  dstEndTime.tm_mon = 3; // April is month 3 (0-based)
  dstEndTime.tm_mday = 1;
  time_t firstDayOfApr = mktime(&dstEndTime);
  struct tm *firstApr = localtime(&firstDayOfApr);
  int dstEndDay = 1 + (7 - firstApr->tm_wday) % 7; // First Sunday

  // Check if current date is within DST period
  if ((month > 10 || (month == 10 && day >= dstStartDay)) ||
      (month < 4 || (month == 4 && day <= dstEndDay))) {
    unixTime += (timeZoneOffsetHours + dstOffsetHours) * 3600; // Apply DST
  } else {
    unixTime += timeZoneOffsetHours * 3600; // Standard time
  }

  RTCTime timeToSet = RTCTime(unixTime);
  RTC.setTime(timeToSet);
}


void onMqttMessage(int messageSize) {
  // Read the incoming message
  String message = mqttclient.readString();

  // Parse the message
  int separatorIndex = message.indexOf(':');
  if (separatorIndex != -1) {
    String sensor = message.substring(0, separatorIndex);
    String action = message.substring(separatorIndex + 1);

    // Check if the sensor ID matches
    if (sensor == nfcClientId) {
      // Define messages
      if (action == "Allow") {
        displayfeedback("Access Granted");
      } else if (action == "Deny") {
        displayfeedback("Access Denied");
      } else if (action == "Mismatch") {
        displayfeedback("Provided ID's Do Not Match");
      } else if (action == "Timeout") {
        displayfeedback("Timed Out, Please try again");
      } else {
        displayfeedback("Unknown Action");
      }

      // Display the message for 2 seconds
      delay(2000);

      // Revert back to the default message
      displayfeedback("Present ID to Access Area");
    }
  }
}