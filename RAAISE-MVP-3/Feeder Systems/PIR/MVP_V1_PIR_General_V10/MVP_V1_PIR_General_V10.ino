// Wifi Settings
#include "WiFiS3.h"

// MQTT Settings
#include <ArduinoMqttClient.h>
WiFiClient tofClient;
MqttClient mqttclient(tofClient);

// Time Sync
#include "RTC.h"        // Include the RTC library
#include <NTPClient.h>  // Include the NTP library
WiFiUDP Udp;            // A UDP protocol instance
NTPClient timeClient(Udp);
#include <time.h>

// OLED display settings
#include <Wire.h>
#include <SparkFun_Qwiic_OLED.h>
QwiicNarrowOLED myOLED;
#include <res/qw_fnt_5x7.h>

// LED Matrix Settings
#include "Arduino_LED_Matrix.h"  // Include the library for the built-in LED matrix

ArduinoLEDMatrix matrix;  // Create an instance of the ArduinoLEDMatrix class

// ToF Settings
#include <SparkFun_VL53L5CX_Library.h>
SparkFun_VL53L5CX myImager;
VL53L5CX_ResultsData measurementData;  // Result data class structure, 1356 bytes of RAM

// Thresholds
int pixelMovementThreshold = 100;     // Movement threshold for detecting significant movement
int motionDetectionPercentage = 15;  // Percentage of pixels required for motion detection (default 50%)
unsigned long motionCooldown = 1000; // 1 second cooldown between detections
unsigned long lastMotionDetected = 0; // Last motion detection timestamp

int lastDistances[64] = { 0 };  // Store the last distance value for each pixel

// WiFi and MQTT credentials and settings
char mySSID[] = "RAAISE-TestBed";           // WiFi SSID
char myPSWD[] = "RAAISE@0107";              // WiFi password
int mqttPort = 1884;                        // MQTT Port No
const char mqtt_broker[] = "raaise.local";  // MQTT broker IP
const char userName[] = "raaise";           // MQTT username
const char userPSWD[] = "raaise";           // MQTT password

// Device Specific Settings
const char mqttTopic[] = "PIR_Data";
const char statusTopic[] = "Sensor_Status";
const char tofClientId[] = "PS10";

// Additional Declarations
unsigned long previousMillis = 0;

// For Status Messages
unsigned long lastStatusMsg = 0;              // For status message timing
const unsigned long STATUS_INTERVAL = 10000;  // 10 seconds

// Frame to represent the LED matrix state
byte frame[8][12] = {
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
};

// Function to update and render the matrix with the current frame
void updateMatrix() {
  matrix.renderBitmap(frame, 8, 12);  // Render the frame to the LED matrix
}

// Function to map the 8x8 sensor data to the 8x8 section of the LED matrix and detect motion
bool mapSensorDataToMatrixAndDetectMotion(VL53L5CX_ResultsData *data) {
  // Clear the frame before updating
  memset(frame, 0, sizeof(frame));

  int pixelsWithMotion = 0;

  // Loop through all 64 pixels
  for (int i = 0; i < 64; i++) {
    int y = i % 8;  // Remap row (0 to 7)
    int x = i / 8;  // Remap column (0 to 7)

    // Calculate the difference between the current and last distance values
    int distanceChange = abs(data->distance_mm[i] - lastDistances[i]);

    // If the change exceeds the movement threshold, light up the corresponding LED
    if (distanceChange >= pixelMovementThreshold) {
      frame[y][x] = 1;     // Light up corresponding LED in matrix
      pixelsWithMotion++;  // Count the number of pixels with detected motion
    }

    // Update the last distances
    lastDistances[i] = data->distance_mm[i];
  }

  updateMatrix();  // Update the matrix with the new frame

  // Check if the percentage of pixels with motion exceeds the threshold
  int requiredPixelsWithMotion = (64 * motionDetectionPercentage) / 100;
  return (pixelsWithMotion >= requiredPixelsWithMotion);  // Motion detected if more than the set percentage of pixels show movement
}

// Function to display a message on the OLED
void displayStatus(const String &message) {
  myOLED.erase();
  myOLED.setCursor(0, 0);
  myOLED.print(message);
  myOLED.display();
}

void setup() {
  Serial.begin(115200);
  Wire1.begin();
  Wire.setClock(1000000);  // Set I2C clock to 1 MHz for faster communication

  // Initialize the OLED display
  myOLED.begin();
  myOLED.setFont(&QW_FONT_5X7);
  displayStatus("Initializing...");
  delay(500);

  // Initialize the LED matrix
  matrix.begin();
  matrix.clear();

  // Initialize VL53L5CX sensor
  if (myImager.begin() == false) {
    displayStatus("ToF Sensor Fail");
    while (1)
      ;  // Stop if sensor not connected
  }

  // Set the sensor frequency to 15Hz for maximum performance
  bool response = myImager.setRangingFrequency(15);  // Set sensor frequency
  if (response == true) {
    int frequency = myImager.getRangingFrequency();
    Serial.print("Ranging frequency set to ");
    Serial.print(frequency);
    Serial.println(" Hz.");
  } else {
    displayStatus("Freq Error");
    while (1)
      ;
  }

  myImager.setResolution(8 * 8);
  myImager.startRanging();
  displayStatus("ToF Sensor Ready");
  delay(500);

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

  mqttclient.setId(tofClientId);
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
  String readyMsg = "Device Ready\nID: " + String(tofClientId);
  displayStatus(readyMsg);
  delay(2000);
}

void loop() {
  RTCTime currentTime;
  RTC.getTime(currentTime);

  mqttclient.poll();

  // Poll the ToF sensor for data
  if (myImager.isDataReady()) {
    if (myImager.getRangingData(&measurementData)) {
      unsigned long currentMillis = millis();
      if (mapSensorDataToMatrixAndDetectMotion(&measurementData)) {
        // If motion is detected and cooldown period has passed
        if (currentMillis - lastMotionDetected > motionCooldown) {
          Serial.println("Motion Detected");
          displayStatus("Motion Detected");
          String mqttMessage = String(tofClientId) + ";" + "Detected" + ";" + String(currentTime);
          mqttclient.beginMessage(mqttTopic);
          mqttclient.print(mqttMessage);
          mqttclient.endMessage();
          lastMotionDetected = currentMillis;  // Update the last motion detected time
        }
      } else {
        displayStatus("Scanning...");
      }
    }
  }

  // Send status message every 10 seconds
  if (millis() - lastStatusMsg > STATUS_INTERVAL) {
    sendStatusMessage(currentTime);
    lastStatusMsg = millis();
  }
}

void sendStatusMessage(const RTCTime &currentTime) {
  String statusMessage = String(tofClientId) + ";" + String(currentTime);
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
