import os
import cv2
import dlib
import numpy as np
import paho.mqtt.client as mqtt
import datetime

# Load the trained model
target_dir = "/home/pi/Dlib_face_recog_CC01/trained_model"
features_file = os.path.join(target_dir, "features.npy")
labels_file = os.path.join(target_dir, "labels.npy")
features = np.load(features_file)
labels = np.load(labels_file)

# Load face detector and shape predictor
face_detector = dlib.get_frontal_face_detector()
shape_predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat") # Change the path if needed
face_recognizer = dlib.face_recognition_model_v1("dlib_face_recognition_resnet_model_v1.dat") # Change the path if needed

# Initialize the MQTT client
mqtt_client = mqtt.Client("msg2")
mqtt_client.username_pw_set("raaise", "raaise")
mqtt_broker_address = "raaise.local"
mqtt_broker_port = 1884
mqtt_client.connect(mqtt_broker_address, mqtt_broker_port, 60)

# Function to publish recognized face via MQTT with topic and message
def publish_recognized_face(topic, message):
    mqtt_client.publish(topic, message)

# Initialize the video capture with reduced frame resolution
width = 320  # Adjust as needed
height = 240  # Adjust as needed
fps = 30  # Adjust as needed
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
cap.set(cv2.CAP_PROP_FPS, fps)

# Initialize the timer for continuous publishing
last_publish_time_recognized = datetime.datetime.now()
last_publish_time_no_face = datetime.datetime.now()
last_publish_time_sensor_status = datetime.datetime.now()

while True:
    ret, frame = cap.read()
    
    if not ret:
        break
    
    # Convert the frame to grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Detect faces in the grayscale frame
    faces = face_detector(gray)
    
    if len(faces) > 0:
        for face in faces:
            # Get the facial landmarks
            landmarks = shape_predictor(gray, face)
            
            # Compute the face descriptor
            face_descriptor = face_recognizer.compute_face_descriptor(frame, landmarks)
            
            # Compare with the trained data
            distances = np.linalg.norm(features - np.array(face_descriptor), axis=1)
            min_distance_idx = np.argmin(distances)
            min_distance = distances[min_distance_idx]
            
            # Recognize the person if the distance is below a threshold
            threshold = 0.4 # Adjust the threshold as needed
            if min_distance < threshold:
                label = labels[min_distance_idx]
            else:
                label = "Unknown"
            
            # Publish recognized face via MQTT every 1 second
            current_time = datetime.datetime.now()
            if (current_time - last_publish_time_recognized).total_seconds() >= 1:
                recognized_users = ['U1', 'U2', 'U3', ..., 'U100']  # List of recognized user labels
                concatenated_message = f"CC01;{label if label in recognized_users else 'Unknown'};{current_time.strftime('%Y-%m-%dT%H:%M:%S')}"
                publish_recognized_face("CAM_Data", concatenated_message)
                
                # Update the last publish time for recognized face
                last_publish_time_recognized = current_time
            
            # Display the label (name of the person) on the image
            cv2.putText(frame, label, (face.left(), face.top() - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
    else:
        # Publish "No face detected" every 5 seconds
        current_time = datetime.datetime.now()
        if (current_time - last_publish_time_no_face).total_seconds() >= 5:
            publish_recognized_face("CAM_Data", "No face detected")
            last_publish_time_no_face = current_time
    
    # Publish "CC01;Timestamp" to "Sensor_Status" every 10 seconds
    current_time = datetime.datetime.now()
    if (current_time - last_publish_time_sensor_status).total_seconds() >= 10:
        message = f"CC01;{current_time.strftime('%Y-%m-%dT%H:%M:%S')}"
        publish_recognized_face("Sensor_Status", message)
        last_publish_time_sensor_status = current_time

    # Display the frame
    cv2.imshow("Real-time Face Recognition", frame)
    
    # Check for exit key
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release the video capture
cap.release()
cv2.destroyAllWindows()
