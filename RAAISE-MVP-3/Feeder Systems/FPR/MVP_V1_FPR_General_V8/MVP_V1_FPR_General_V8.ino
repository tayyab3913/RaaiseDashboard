// Wifi Settings
#include "WiFiS3.h"

// MQTT Settings
#include <ArduinoMqttClient.h>
WiFiClient fpsClient;
MqttClient mqttclient(fpsClient);

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

//Button Settings
#include <SparkFun_Qwiic_Button.h>
QwiicButton qwiicButton;
uint8_t brightness = 100;

// FPR Settings
#include <DFRobot_ID809_I2C.h>
DFRobot_ID809_I2C fingerprint;
#define COLLECT_NUMBER 3
String fpsSuccess = "";
int fpsFail = 0;
bool waitingForFinger = true;

// WiFi and MQTT credentials and settings
char mySSID[] = "RAAISE-TestBed";           // WiFi SSID
char myPSWD[] = "RAAISE@0107";              // WiFi password
int mqttPort = 1884;                        // MQTT Port No
const char mqtt_broker[] = "raaise.local";  // MQTT broker IP
const char userName[] = "raaise";           // MQTT username
const char userPSWD[] = "raaise";           // MQTT password

// Device Specific Settings
// **********PLEASE CHANGE BASED ON DEVICE ID**********
const char mqttTopic[] = "FPR_Data";
const char statusTopic[] = "Sensor_Status";
const char fpsClientId[] = "FP01";
// **********PLEASE CHANGE BASED ON DEVICE ID**********

// Additional Declarations
const long interval = 100;
unsigned long lastMsg = 0;
int ret = 0;
bool inRegisterMode = false;

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

void setup() {
  Serial.begin(115200);
  Wire1.begin();

  // Initialize the OLED display
  myOLED.begin();
  myOLED.setFont(&QW_FONT_5X7);
  displayStatus("Initializing...");

  // Initialize Qwiic Button
  if (qwiicButton.begin() == false) {
    displayStatus("Qwiic Button not detected");
    while (1)
      ;  // Stop if sensor not connected
  }
  qwiicButton.LEDoff();

  //initialize Fingerprint Sensor
  if (fingerprint.begin() == false) {
    displayStatus("FPS Sensor Fail");
    while (1)
      ;  // Stop if sensor not connected
  }

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

  mqttclient.setId(fpsClientId);
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
  String readyMsg = "Device Ready\nID: " + String(fpsClientId);
  displayStatus(readyMsg);
  delay(2000);
}

void loop() {
  RTCTime currentTime;
  RTC.getTime(currentTime);

  mqttclient.poll();
  unsigned long now = millis();

  if (now - lastMsg >= interval) {
    lastMsg = now;

    // Check if the button is pressed
    if (qwiicButton.isPressed()) {
      inRegisterMode = !inRegisterMode;  // Toggle mode

      if (inRegisterMode) {
        displayStatus("Mode: Register");
        qwiicButton.LEDon(brightness);  // Turn on LED in registration mode
      } else {
        displayStatus("Mode: Verify");
        qwiicButton.LEDoff();  // Turn off LED in verification mode
      }

      while (qwiicButton.isPressed()) delay(10);  // Wait for button release
      delay(500);                                 // Debounce delay
    }

    if (inRegisterMode) {
      displayStatus("Touch sensor to register");
      // Check for sensor touch or button press to exit registration mode
      while (!fingerprint.detectFinger()) {
        delay(10);                                    // Short delay for responsiveness
        if (qwiicButton.isPressed()) {                // Exit registration mode
          while (qwiicButton.isPressed()) delay(10);  // Wait for button release
          inRegisterMode = false;
          qwiicButton.LEDoff();
          displayStatus("Registration Cancelled");
          delay(500);
          return;  // Return to start of loop for immediate mode switch
        }
      }
      // Start fingerprint registration
      uint8_t ID, i;
      ID = fingerprint.getEmptyID();
      if (ID == ERR_ID809) {
        displayStatus("Error getting empty ID");
        return;
      }
      displayStatus("Registering ID: " + String(ID));
      i = 0;
      while (i < COLLECT_NUMBER) {
        fingerprint.ctrlLED(fingerprint.eBreathing, fingerprint.eLEDBlue, 0);
        displayStatus("Sampling " + String(i + 1) + "(th)");
        if (fingerprint.collectionFingerprint(10) != ERR_ID809) {
          fingerprint.ctrlLED(fingerprint.eFastBlink, fingerprint.eLEDYellow, 3);
          displayStatus("Sampling Succeeds");
          i++;
        } else {
          displayStatus("Sampling Failed");
          while (fingerprint.detectFinger())
            ;
          return;
        }
      }
      if (fingerprint.storeFingerprint(ID) != ERR_ID809) {
        fingerprint.ctrlLED(fingerprint.eKeepsOn, fingerprint.eLEDGreen, 0);
        displayStatus("ID " + String(ID) + " Stored");
        delay(1000);
        fingerprint.ctrlLED(fingerprint.eNormalClose, fingerprint.eLEDBlue, 0);
      } else {
        displayStatus("Storage Failed");
      }
    } else {
      // Fingerprint verification code
      if (waitingForFinger) {
        displayStatus("Place finger for verification");
        waitingForFinger = false;
      }
      if (fingerprint.detectFinger()) {
        waitingForFinger = true;
        fingerprint.ctrlLED(fingerprint.eBreathing, fingerprint.eLEDBlue, 0);
        if (fingerprint.collectionFingerprint(10) != ERR_ID809) {
          uint8_t ret = fingerprint.search();
          if (ret != 0) {
            fingerprint.ctrlLED(fingerprint.eKeepsOn, fingerprint.eLEDGreen, 0);
            displayStatus("Matched: ID " + String(ret));
            fpsSuccess = String(ret);
          } else {
            fingerprint.ctrlLED(fingerprint.eKeepsOn, fingerprint.eLEDRed, 0);
            displayStatus("No Match Found");
            fpsSuccess = "No-Match";
          }

          String mqttMessage = String(fpsClientId) + ";" + fpsSuccess + ";" + String(currentTime);

          // Publish MQTT message to single topic
          mqttclient.beginMessage(mqttTopic);
          mqttclient.print(mqttMessage);
          mqttclient.endMessage();

          delay(1000);
          fingerprint.ctrlLED(fingerprint.eNormalClose, fingerprint.eLEDBlue, 0);

        } else {
          displayStatus("Capture failed");
        }
      }
    }
  }
  delay(10);

  // Send status message every 10 seconds
  if (millis() - lastStatusMsg > STATUS_INTERVAL) {
    sendStatusMessage(currentTime);
    lastStatusMsg = millis();
  }
}

void sendStatusMessage(const RTCTime &currentTime) {
  String statusMessage = String(fpsClientId) + ";" + String(currentTime);
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
