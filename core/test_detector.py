import cv2
import os
import json
from detector.yolo import YoloDetector

def main():
    image_path = "meeting_room.png"
    output_path = "meeting_room_detected.png"
    
    if not os.path.exists(image_path):
        print(f"Error: Sample image '{image_path}' not found.")
        return
        
    print(f"Loading image '{image_path}'...")
    frame = cv2.imread(image_path)
    if frame is None:
        print("Error: Could not read the image.")
        return
        
    print("Initializing YoloDetector...")
    # Initialize detector with default nano model and 0.5 confidence threshold
    detector = YoloDetector(model_path="yolov8n.pt", confidence_threshold=0.5)
    
    print("Running detection...")
    results = detector.detect(frame)
    
    print("\n--- Detection Results ---")
    print(json.dumps(results, indent=2))
    print("-------------------------\n")
    
    print(f"Annotating frame and saving to '{output_path}'...")
    # Generate annotated image
    annotated_frame = detector.draw_detections(frame, results)
    
    # Save the output image
    success = cv2.imwrite(output_path, annotated_frame)
    if success:
        print("Successfully saved annotated image.")
    else:
        print("Failed to save annotated image.")

if __name__ == "__main__":
    main()
