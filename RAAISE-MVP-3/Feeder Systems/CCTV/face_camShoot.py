import cv2
import os

# Set the base directory
base_dir = '/home/pi/Dlib_face_recog_CC01/Images_dataset'

# Create the 'dataset' directory if it doesn't exist
dataset_dir = os.path.join(base_dir, 'U4')
os.makedirs(dataset_dir, exist_ok=True)

# Number of images to capture for each user
num_images_to_capture = 20

# Initialize the camera
cap = cv2.VideoCapture(0)

# Set camera resolution (optional)
# Choose a standard resolution like 1280x960 for 4:3 aspect ratio
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

# Function to capture images for a specific user
def capture_images_for_user(name):
    # Create the user directory if it doesn't exist
    user_dir = os.path.join(dataset_dir, name)
    os.makedirs(user_dir, exist_ok=True)

    # Counter for captured images
    image_count = 0

    # Loop to capture images
    while image_count < num_images_to_capture:
        # Capture frame-by-frame
        ret, frame = cap.read()

        # Display the frame
        cv2.imshow('Press Space to Capture', frame)

        # Wait for key press
        key = cv2.waitKey(1) & 0xFF

        # Capture image when spacebar is pressed
        if key == ord(' '):
            # Generate the file path for the captured image
            image_path = os.path.join(user_dir, f'{name}_{image_count}.jpg')

            # Write the captured frame to an image file in JPEG format
            cv2.imwrite(image_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])  # Set JPEG quality to 95
            print(f"Image {image_count + 1} for User {name} captured as {image_path}")
            
            # Increment the image count
            image_count += 1

        # Break the loop when 'q' is pressed
        elif key == ord('q'):
            break

# Set the name for the user
name = 'U4'

# Capture images for the specified user
capture_images_for_user(name)

# Release the camera and close OpenCV windows
cap.release()
cv2.destroyAllWindows()
