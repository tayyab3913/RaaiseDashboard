#include <DFRobot_ID809_I2C.h>

DFRobot_ID809_I2C fingerprint;

void setup() {
  Serial.begin(115200);
  fingerprint.begin(); // Initialize the fingerprint sensor

  // Check if the fingerprint sensor is connected
  if (!fingerprint.isConnected()) {
    Serial.println("Fingerprint sensor not connected!");
    while (1);
  }

  // Delete all fingerprints
  if (fingerprint.delFingerprint(DELALL) == 0) {
    Serial.println("Failed to delete all fingerprints!");
  } else {
    Serial.println("All fingerprints deleted successfully!");
  }
}

void loop() {
  // Nothing to do here
}
