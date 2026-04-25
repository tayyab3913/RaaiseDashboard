// Wifi Settings
#include "WiFiS3.h"

// MQTT Settings
#include <ArduinoMqttClient.h>
WiFiClient tofClient;
MqttClient mqttclient(tofClient);

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
#include <res/qw_fnt_5x7.h>

// RFID settings
#include "SparkFun_UHF_RFID_Reader.h"  // RFID Reader library
RFID nano;                             // Create 'nano' instance
struct TagInfo {
  String tag;
  unsigned long timestamp;
};
const int MAX_TAGS = 50;
TagInfo recentTags[MAX_TAGS];
const unsigned long TAG_EXPIRY_TIME = 5000;  // 5 seconds

// WiFi and MQTT credentials and settings
char mySSID[] = "RAAISE-TestBed";           // WiFi SSID
char myPSWD[] = "RAAISE@0107";              // WiFi password
int mqttPort = 1884;                        // MQTT Port No
const char mqtt_broker[] = "raaise.local";  // MQTT broker IP
const char userName[] = "raaise";           // MQTT username
const char userPSWD[] = "raaise";           // MQTT password

// Device Specific Settings
// **********PLEASE CHANGE BASED ON DEVICE ID**********
const char mqttTopic[] = "RFID_Data";
const char statusTopic[] = "Sensor_Status";
char rfidClientId[] = "RF01";
// **********PLEASE CHANGE BASED ON DEVICE ID**********

// Additional Declarations
unsigned long lastMsg = 0;
String rfidTag = "";

// For Status Messages
unsigned long lastStatusMsg = 0;              // For status message timing
const unsigned long STATUS_INTERVAL = 10000;  // 10 seconds

// Function to display a message on the OLED
void displayStatus(const String &message) {
  myOLED.erase();
  myOLED.setCursor(0, 0);
  myOLED.print(message);
  myOLED.display();
}

void setup() {
  Serial.begin(115200);
  Serial.println("Setup started");
  Wire1.begin();

  // Initialize the OLED display
  myOLED.begin();
  myOLED.setFont(&QW_FONT_5X7);
  displayStatus("Initializing...");

  // Initialize RFID module
  Serial1.begin(115200);  // Start Serial1 for RFID communication
  nano.begin(Serial1);    // Initialize RFID with Serial1
  nano.getVersion();

  if (nano.msg[0] == ERROR_WRONG_OPCODE_RESPONSE) {
    nano.stopReading();
    displayStatus("Module continuously reading.\nAsking it to stop...");
    delay(1500);
  } else {
    displayStatus("Setting Nano to desired baud rate...");
    nano.setBaud(115200);
    delay(1250);
  }
  nano.getVersion();
  if (nano.msg[0] != ALL_GOOD) {
    displayStatus("Failed to communicate with Nano. \nCheck wiring and baud rate.");
  } else {
    displayStatus("RFID Connected");
  }
  delay(1000);
  nano.setTagProtocol();
  nano.setAntennaPort();
  displayStatus("Setting region and power");
  nano.setRegion(REGION_AUSTRALIA);
  nano.setReadPower(2500);
  nano.startReading();
  displayStatus("Started reading tags.");

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

  mqttclient.setId(rfidClientId);
  mqttclient.setUsernamePassword(userName, userPSWD);
  while (!mqttclient.connect(mqtt_broker, mqttPort)) {
    delay(500);
  }
  String MQTTConMsg = "MQTT Connected:\n" + String(mqtt_broker) + "\nTopic: " + String(mqttTopic);
  displayStatus(MQTTConMsg);

  delay(1000);

  // Starting the RTC and connection to NTP server
  RTC.begin();
  timeClient.begin();
  timeClient.update();
  adjustForDST();

  // Device is ready
  String readyMsg = "Device Ready\nID: " + String(rfidClientId);
  displayStatus(readyMsg);
  delay(2000);
}

void loop() {
  RTCTime currentTime;
  RTC.getTime(currentTime);

  rfidTag = "";

  if (nano.check()) {
    byte responseType = nano.parseResponse();
    if (responseType == RESPONSE_IS_KEEPALIVE) {
      displayStatus("Scanning...");
    } else if (responseType == RESPONSE_IS_TAGFOUND) {
      byte tagEPCBytes = nano.getTagEPCBytes();
      rfidTag = "";
      for (byte x = 0; x < tagEPCBytes; x++) {
        if (nano.msg[31 + x] < 0x10) rfidTag += "0";
        rfidTag += String(nano.msg[31 + x], HEX);
      }
      displayStatus("Tag found:\n" + rfidTag);
      if (rfidTag.length() > 0 && !isTagRecent(rfidTag)) {
        sendMQTTMessage(rfidTag, currentTime);
        updateRecentTags(rfidTag, currentTime);
      }
    } else if (responseType == ERROR_CORRUPT_RESPONSE) {
      displayStatus("Error: Corrupt Response");
    } else {
      String ScanningMsg = String(rfidClientId) + ": Ready to Scan";
      displayStatus(ScanningMsg);
    }
  }

  // Send status message every 10 seconds
  if (millis() - lastStatusMsg > STATUS_INTERVAL) {
    sendStatusMessage(currentTime);
    lastStatusMsg = millis();
  }
}

bool isTagRecent(const String &tag) {
  unsigned long currentMillis = millis();
  for (int i = 0; i < MAX_TAGS; ++i) {
    if (recentTags[i].tag == tag && currentMillis - recentTags[i].timestamp < TAG_EXPIRY_TIME) {
      return true;
    }
  }
  return false;
}

void sendMQTTMessage(const String &tag, const RTCTime &currentTime) {
  String msg = "Card Read\nID:" + tag;
  displayStatus(msg);
  String mqttMessage = String(rfidClientId) + ";" + tag + ";" + String(currentTime);
  mqttclient.beginMessage(mqttTopic);
  mqttclient.print(mqttMessage);
  mqttclient.endMessage();
}

void updateRecentTags(const String &tag, const RTCTime &currentTime) {
  unsigned long currentMillis = millis();
  for (int i = 0; i < MAX_TAGS; ++i) {
    if (recentTags[i].tag == "" || currentMillis - recentTags[i].timestamp >= TAG_EXPIRY_TIME) {
      recentTags[i].tag = tag;
      recentTags[i].timestamp = currentMillis;
      return;
    }
  }
}

void sendStatusMessage(const RTCTime &currentTime) {
  String statusMessage = String(rfidClientId) + ";" + String(currentTime);
  mqttclient.beginMessage(statusTopic);
  mqttclient.print(statusMessage);
  mqttclient.endMessage();
}

void adjustForDST() {
  timeClient.update();
  auto timeZoneOffsetHours = 10; // Standard time zone offset for Australia
  auto dstOffsetHours = 1; // Daylight saving time offset for Australia
  time_t unixTime = timeClient.getEpochTime(); // Correct type for Unix time
  struct tm *localTime = localtime(&unixTime); // Correct usage of localtime

  int year = localTime->tm_year + 1900;
  int month = localTime->tm_mon + 1;
  int day = localTime->tm_mday;
  int wday = localTime->tm_wday;
  int hour = localTime->tm_hour;

  // Calculate DST start and end dates
  int dstStartDay = (7 - ((wday - 1) % 7)) + 1; // First Sunday in October
  int dstEndDay = (7 - (wday % 7)) + 1; // First Sunday in April

  // Check if current date is within DST period
  if ((month > 10 || (month == 10 && day >= dstStartDay)) ||
      (month < 4 || (month == 4 && day <= dstEndDay))) {
    unixTime += (timeZoneOffsetHours + dstOffsetHours) * 3600;
  } else {
    unixTime += timeZoneOffsetHours * 3600;
  }

  RTCTime timeToSet = RTCTime(unixTime);
  RTC.setTime(timeToSet);
}