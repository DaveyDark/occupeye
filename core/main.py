import os
import sys
import json
import time
import threading
from datetime import datetime

# Add project directories to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from detector.yolo import YoloDetector
from detector.face import FaceDetector
from identity.face_identifier import FaceIdentifier
from sources.rtsp import RtspSource
from sources.video import VideoSource
from occupancy.state_machine import OccupancyStateMachine
from publisher.api import ApiPublisher

# Global lock for serializing YOLO inference across threads
detector_lock = threading.Lock()
face_detector: FaceDetector | None = None
face_identifier: FaceIdentifier | None = None

def room_worker(source_url: str, detector: YoloDetector, publisher: ApiPublisher, 
                sample_interval: float, smoothing_config: dict, stop_event: threading.Event):
    """
    Worker function executed in a separate thread for each camera/room feed.
    """
    # Use basename for logging, and full source_url for publishing
    room_name = os.path.basename(source_url)
    
    print(f"[{room_name}] Starting worker thread...")
    
    # Initialize appropriate source engine
    is_rtsp = source_url.startswith("rtsp://") or source_url.startswith("rtsps://")
    source = None
    
    # Initialize occupancy state machine
    state_machine = OccupancyStateMachine(
        positive_threshold=smoothing_config.get("positive_threshold", 3),
        negative_threshold=smoothing_config.get("negative_threshold", 10)
    )
    
    # Establish connection loop
    while not stop_event.is_set():
        try:
            if is_rtsp:
                source = RtspSource(source_url)
                # Wait for RTSP connection
                connected = False
                for _ in range(15):
                    if stop_event.is_set():
                        break
                    if source.is_connected():
                        connected = True
                        break
                    time.sleep(1.0)
                if not connected:
                    print(f"[{room_name}] Error: Failed to connect to stream {source_url}. Retrying in 10s...")
                    source.release()
                    time.sleep(10.0)
                    continue
            else:
                source = VideoSource(source_url, sample_interval=sample_interval)
            break
        except Exception as e:
            print(f"[{room_name}] Initialization failed: {e}. Retrying in 10s...")
            time.sleep(10.0)
            
    if stop_event.is_set():
        if source:
            source.release()
        return

    print(f"[{room_name}] Stream source initialized successfully. Starting analysis loop...")
    
    try:
        while not stop_event.is_set():
            loop_start = time.time()
            
            # Fetch frame
            if is_rtsp:
                success, frame = source.get_next_frame()
            else:
                success, frame, _ = source.get_next_frame()
                
            if not success or frame is None:
                if not is_rtsp:
                    # Video file ended - loop it to simulate continuous CCTV feed
                    print(f"[{room_name}] Video file finished. Looping back to the beginning...")
                    source.reset()
                    continue
                else:
                    # RTSP stream stalled
                    print(f"[{room_name}] Warning: RTSP stream stalled. Waiting...")
                    time.sleep(1.0)
                    continue
            
            # Run YOLO detection thread-safely
            with detector_lock:
                results = detector.detect(frame)

            face_results = {"count": 0, "detections": []}
            if face_detector is not None:
                face_results = face_detector.detect(
                    frame,
                    rois=[det["box"] for det in results["detections"]] or None,
                )

            identity_results = {"recognized_count": 0, "recognized_names": [], "detections": []}
            if face_identifier is not None and face_results["detections"]:
                identity_results = face_identifier.identify(frame, face_results["detections"])
                
            count = results["count"]
            face_count = face_results["count"]
            recognized_count = identity_results["recognized_count"]
            recognized_names = identity_results["recognized_names"]
            max_conf = results["max_confidence"]
            
            # Update state machine (applies temporal smoothing)
            state_changed, is_occupied = state_machine.update(count)
            
            # Print current frame status to console
            state_str = "OCCUPIED" if is_occupied else "AVAILABLE"
            time_str = datetime.now().strftime("%H:%M:%S")
            identity_str = ", ".join(recognized_names) if recognized_names else "none"
            print(
                f"[{time_str}] [{room_name}] People detected: {count} | Faces detected: {face_count} | "
                f"Recognized: {identity_str} | Smoothed State: {state_str} (Conf: {max_conf:.2f})"
            )
            
            # Publish to API if room occupancy state transitioned
            if state_changed:
                print(f"[{room_name}] Occupancy state changed! Publishing update...")
                # Run publish asynchronously or simple blocking since timeout is short
                publisher.publish(source_url, is_occupied)
                
            # Sleep remaining time of the interval
            elapsed = time.time() - loop_start
            sleep_time = max(0.1, sample_interval - elapsed)
            time.sleep(sleep_time)
            
    except Exception as e:
         print(f"[{room_name}] Error in tracking loop: {e}")
    finally:
        if source:
            source.release()
        print(f"[{room_name}] Worker thread stopped.")

def main():
    config_path = "config.json"
    
    if not os.path.exists(config_path):
        print(f"Error: Configuration file '{config_path}' not found.")
        sys.exit(1)
        
    print("Loading OccupEye core configuration...")
    with open(config_path, "r") as f:
        config = json.load(f)
        
    api_url = config["api_url"]
    sample_interval = config.get("sample_interval_seconds", 2.0)
    smoothing = config.get("smoothing", {"positive_threshold": 3, "negative_threshold": 10})
    face_config = config.get("face_recognition", {})
    rooms = config.get("rooms", [])
    
    if not rooms:
        print("Warning: No rooms configured in config.json. Exiting.")
        sys.exit(0)
        
    print(f"Initializing YoloDetector...")
    detector = YoloDetector(model_path="yolov8n.pt", confidence_threshold=0.5)

    print("Initializing FaceDetector...")
    global face_detector
    face_detector = FaceDetector()

    if face_config.get("enabled", True):
        gallery_dir = face_config.get("gallery_dir", "faces")
        confidence_threshold = float(face_config.get("confidence_threshold", 65.0))
        min_samples_per_person = int(face_config.get("min_samples_per_person", 2))
        print(f"Initializing FaceIdentifier from gallery: {gallery_dir}")
        global face_identifier
        face_identifier = FaceIdentifier(
            gallery_dir=gallery_dir,
            confidence_threshold=confidence_threshold,
            min_samples_per_person=min_samples_per_person,
        )
    else:
        print("Face identification disabled in config.json.")
    
    print(f"Initializing ApiPublisher to endpoint: {api_url}")
    publisher = ApiPublisher(api_url)
    
    stop_event = threading.Event()
    threads = []
    
    print(f"\nSpawning {len(rooms)} tracking threads...")
    for source_url in rooms:
        t = threading.Thread(
            target=room_worker,
            args=(source_url, detector, publisher, sample_interval, smoothing, stop_event),
            daemon=True
        )
        threads.append(t)
        t.start()
        
    print("\nOccupEye core service is running. Press Ctrl+C to terminate.")
    print("=" * 60)
    
    try:
        # Keep main thread alive
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n\nShutting down OccupEye core service...")
        stop_event.set()
        
        # Wait for threads to clean up and exit
        for t in threads:
            t.join(timeout=3.0)
            
    print("All threads stopped. Cleanup complete. Core service shutdown.")

if __name__ == "__main__":
    main()
