import cv2
import time
import os
from sources.rtsp import RtspSource
from detector.yolo import YoloDetector

def main():
    rtsp_url = "rtsp://9627b0bf2a7b.entrypoint.cloud.wowza.com:1935/app-p5260J38/66abe4b9_stream1"
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    output_image_path = os.path.join(output_dir, "rtsp_frame.png")
    
    print("Initializing YoloDetector...")
    detector = YoloDetector(model_path="yolov8n.pt", confidence_threshold=0.5)
    
    print(f"Initializing RtspSource with stream:\n  {rtsp_url}")
    source = RtspSource(rtsp_url)
    
    # Wait for the stream to connect and buffer a few frames
    print("Waiting for stream connection (timeout 15s)...")
    connected = False
    for i in range(15):
        if source.is_connected():
            connected = True
            break
        print(f"  Waiting... ({i+1}/15)")
        time.sleep(1.0)
        
    if not connected:
        print("Error: Could not connect to the RTSP stream.")
        source.release()
        return
        
    print("\nStarting periodic frame checks (every 2 seconds)...")
    last_frame = None
    
    try:
        for i in range(5):
            print(f"\n--- Check {i+1}/5 ---")
            success, frame = source.get_next_frame()
            if not success or frame is None:
                print("Failed to retrieve latest frame from stream.")
                continue
                
            last_frame = frame
            height, width = frame.shape[:2]
            print(f"Successfully retrieved frame ({width}x{height})")
            
            # Run occupancy detection
            results = detector.detect(frame)
            print(f"Occupancy count: {results['count']}")
            print(f"Max confidence: {results['max_confidence']:.2f}")
            
            time.sleep(2.0)
            
    finally:
        source.release()
        
    if last_frame is not None:
        print(f"\nSaving the last retrieved frame to '{output_image_path}'...")
        # Save a debug image
        cv2.imwrite(output_image_path, last_frame)
        print("Frame saved successfully.")
    else:
        print("No frames were captured to save.")

if __name__ == "__main__":
    main()
