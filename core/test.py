import sys
import time
import os
import cv2

# Ensure core directory is in the path if run from different cwd
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from detector.yolo import YoloDetector
from detector.face import FaceDetector
from identity.face_identifier import FaceIdentifier
from sources.rtsp import RtspSource
from sources.video import VideoSource

def main():
    if len(sys.argv) < 2:
        print("Error: Missing input stream source.")
        print("\nUsage:")
        print("  uv run python test.py <RTSP_URL_or_video_file_path>")
        print("\nExamples:")
        print("  uv run python test.py rtsp://127.0.0.1:8554/stream1")
        print("  uv run python test.py test_videos/286879_medium.mp4")
        sys.exit(1)

    source_path = sys.argv[1]
    sample_interval = 2.0  # seconds between checks
    
    # Initialize Detector
    print("Initializing YOLOv8 person detector...")
    detector = YoloDetector(model_path="yolov8n.pt", confidence_threshold=0.5)
    print("Initializing face detector...")
    face_detector = FaceDetector()
    print("Initializing face identifier...")
    face_identifier = FaceIdentifier()

    # Determine source type
    is_rtsp = source_path.startswith("rtsp://") or source_path.startswith("rtsps://")
    is_file = os.path.exists(source_path) and not is_rtsp
    
    if is_rtsp:
        print(f"Detected RTSP stream source. Initializing...")
        source = RtspSource(source_path)
        
        # Wait for connection
        print("Connecting to live stream (timeout 15s)...")
        connected = False
        for i in range(15):
            if source.is_connected():
                connected = True
                break
            print(f"  Connecting... ({i+1}/15)")
            time.sleep(1.0)
            
        if not connected:
            print("Error: Failed to connect to the RTSP stream.")
            source.release()
            sys.exit(1)
            
    elif is_file:
        print(f"Detected local video file source. Initializing...")
        try:
            source = VideoSource(source_path, sample_interval=sample_interval)
        except Exception as e:
            print(f"Error loading video file: {e}")
            sys.exit(1)
    else:
        print(f"Error: Invalid source '{source_path}'.")
        print("Must be a valid 'rtsp://' URL or an existing local video file.")
        sys.exit(1)

    print("\n" + "=" * 60)
    print(f"Running occupancy tracking on: {source_path}")
    print(f"Sample Interval: {sample_interval}s")
    print("Press Ctrl+C to stop.")
    print("=" * 60 + "\n")
    
    print(f"{'Time':<12}{'Source Type':<15}{'People Count':<15}{'Faces Count':<15}{'Known Faces':<25}{'Max Confidence':<15}")
    print("-" * 60)

    try:
        while True:
            loop_start = time.time()
            
            # Fetch frame
            if is_rtsp:
                success, frame = source.get_next_frame()
                timestamp_str = time.strftime("%H:%M:%S")
            else:
                success, frame, timestamp = source.get_next_frame()
                timestamp_str = time.strftime('%H:%M:%S', time.gmtime(timestamp))
                
            if not success or frame is None:
                if is_file:
                    print("\nReached the end of the video file.")
                    break
                else:
                    # RTSP stream might be lagging or temporarily disconnected
                    current_time = time.strftime("%H:%M:%S")
                    print(f"{current_time:<12}{'RTSP (stalled)':<15}{'--':<15}{'--':<15}{'--':<15}")
                    time.sleep(sample_interval)
                    continue

            # Run detection
            results = detector.detect(frame)
            count = results["count"]
            max_conf = results["max_confidence"]

            face_results = {"count": 0, "detections": []}
            identity_results = {"recognized_count": 0, "recognized_names": [], "detections": []}

            if count > 0:
                face_results = face_detector.detect(frame, rois=[det["box"] for det in results["detections"]])
                if face_results["detections"]:
                    identity_results = face_identifier.identify(frame, face_results["detections"])

            face_count = face_results["count"]
            known_faces = ", ".join(identity_results["recognized_names"]) if identity_results["recognized_names"] else "none"

            # Log to console
            source_type_str = "RTSP Live" if is_rtsp else "Video File"
            conf_str = f"{max_conf:.2f}" if count > 0 else "0.00"
            print(f"{timestamp_str:<12}{source_type_str:<15}{count:<15}{face_count:<15}{known_faces:<25}{conf_str:<15}")

            # Calculate sleep to maintain constant sample interval
            elapsed = time.time() - loop_start
            sleep_time = max(0.1, sample_interval - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        print("\n\nStopping occupancy tracking (Ctrl+C received)...")
    finally:
        source.release()
        print("Resources released. Goodbye!")

if __name__ == "__main__":
    main()
