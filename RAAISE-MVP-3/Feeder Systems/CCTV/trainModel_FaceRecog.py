import os
import dlib
import cv2
import numpy as np
from PIL import Image

# Function to load images and labels from the dataset directory
def load_dataset(dataset_dir):
    images = []
    labels = []
    print("Dataset Directory:", dataset_dir)
    for person_dir in os.listdir(dataset_dir):
        person_label = person_dir
        person_path = os.path.join(dataset_dir, person_dir)
        if os.path.isdir(person_path):
            print("Loading images for person:", person_label)
            # Extract the person's name from the directory name
            person_name = person_dir.split('_')[0]  # Extract 'U1', 'U2', etc.
            for image_name in os.listdir(person_path):
                image_path = os.path.join(person_path, image_name)
                print("Loading image:", image_path)
                try:
                    image = Image.open(image_path)
                    # Convert image to numpy array
                    image = np.array(image)
                    print("Image loaded successfully:", image_path)
                    images.append(image)
                    labels.append(person_name)  # Use the extracted person name as the label
                except Exception as e:
                    print("Error loading image:", image_path)
                    print("Exception:", e)
    print("Number of images loaded:", len(images))
    return images, labels


# Function to extract features from images

# Initialize the face encoder
face_encoder = dlib.face_recognition_model_v1("dlib_face_recognition_resnet_model_v1.dat")

def extract_features(images):
    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")
    
    features = []
    for image in images:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # Convert image to grayscale
        faces = detector(gray)
        for face in faces:
            # Get the coordinates of the detected face
            x, y, w, h = face.left(), face.top(), face.width(), face.height()
            # Create a rectangle object
            face_rect = dlib.rectangle(x, y, x + w, y + h)
            # Get facial landmarks
            shape = predictor(gray, face_rect)
            # Compute face descriptor using the face encoder
            face_descriptor = np.array(face_encoder.compute_face_descriptor(image, shape))
            features.append(face_descriptor)
    print("Extracted features from", len(features), "out of", len(images), "images.")
    return features

# Load dataset
dataset_dir = "/home/pi/Dlib_face_recog_CC01/Images_dataset"  # Adjust this path accordingly
images, labels = load_dataset(dataset_dir)



# Extract features
features = extract_features(images)

# Create target directory if it doesn't exist
target_dir = "/home/pi/Dlib_face_recog_CC01/trained_model"  # Adjust this path accordingly
os.makedirs(target_dir, exist_ok=True)

# Save features and labels to files
features_file = os.path.join(target_dir, "features.npy")
labels_file = os.path.join(target_dir, "labels.npy")
np.save(features_file, features)
np.save(labels_file, labels)

print("Training completed. Features and labels saved to:", target_dir)
