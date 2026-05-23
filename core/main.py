import os
import sys
import json
import time
import threading
import requests
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

def check_room_booking(api_url: str, room_url: str) -> bool:
    """
    Queries the occupancy API to check if this room is currently reserved/booked.
    """
    try:
        response = requests.get(api_url, timeout=3.0)
        if response.status_code == 200:
            data = response.json()
            for room in data.get("rooms", []):
                if room.get("roomUrl") == room_url:
                    return room.get("isBooked", False)
    except Exception as e:
        # Fail silently to keep detector running without crashing
        pass
    return False

def release_room_booking(base_api_url: str, room_url: str) -> bool:
    """
    Sends a DELETE request to /api/bookings to release/cancel the room reservation.
    """
    bookings_url = base_api_url.replace("/occupancy", "/bookings")
    try:
        response = requests.delete(f"{bookings_url}?roomUrl={requests.utils.quote(room_url)}", timeout=3.0)
        if response.status_code == 200:
            print(f"[Booking Release] Successfully released booking for {room_url}")
            return True
        else:
            print(f"[Booking Release] Failed to release booking for {room_url}: status {response.status_code}")
    except Exception as e:
        print(f"[Booking Release] Error releasing booking for {room_url}: {e}")
    return False

def room_worker(source_url: str, detector: YoloDetector, publisher: ApiPublisher, 
                sample_interval: float, smoothing_config: dict, booking_reset_frames: int, stop_event: threading.Event):
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
    
    # Send immediate connection state (occupied=None / null)
    publisher.publish(source_url, None, [], 0)
    
    tracked_people: dict[str, int] = {}
    prev_people_list: list[str] = None
    prev_person_count: int = None
    
    # Booking tracking variables
    last_booking_check = 0.0
    is_booked = False
    empty_frames_count = 0
    
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

            count = results["count"]
            max_conf = results["max_confidence"]

            face_results = {"count": 0, "detections": []}
            identity_results = {"recognized_count": 0, "recognized_names": [], "detections": []}
            
            # Rely strictly on YOLO people count > 0 to run face detection and avoid false positives
            if count > 0:
                if face_detector is not None:
                    face_results = face_detector.detect(
                        frame,
                        rois=[det["box"] for det in results["detections"]],
                    )

                if face_identifier is not None and face_results["detections"]:
                    identity_results = face_identifier.identify(frame, face_results["detections"])
                
            face_count = face_results["count"]
            recognized_count = identity_results["recognized_count"]
            recognized_names = identity_results["recognized_names"]
            
            # Update state machine (applies temporal smoothing)
            state_changed, is_occupied = state_machine.update(count)
            
            # Periodically check booking status from API
            now = time.time()
            if now - last_booking_check > 5.0:
                is_booked = check_room_booking(publisher.api_url, source_url)
                last_booking_check = now

            if is_booked:
                if is_occupied:
                    if empty_frames_count > 0:
                        print(f"[{room_name}] Occupancy detected in reserved room. Resetting empty frames counter.")
                    empty_frames_count = 0
                else:
                    empty_frames_count += 1
                    print(f"[{room_name}] Room is RESERVED but unoccupied. Frame count: {empty_frames_count}/{booking_reset_frames}")
                    if empty_frames_count >= booking_reset_frames:
                        print(f"[{room_name}] Room unoccupied for {booking_reset_frames} frames. Auto-releasing booking...")
                        if release_room_booking(publisher.api_url, source_url):
                            is_booked = False
                            empty_frames_count = 0
            else:
                empty_frames_count = 0
            
            # Update tracked people list based on current detections and room occupancy state
            if is_occupied:
                # 1. Reset cooldown for currently recognized names (5 frames threshold)
                for name in recognized_names:
                    tracked_people[name] = 5
                
                # 2. Decrement cooldown for other tracked names
                for name in list(tracked_people.keys()):
                    if name not in recognized_names:
                        tracked_people[name] -= 1
                        if tracked_people[name] <= 0:
                            del tracked_people[name]
            else:
                tracked_people.clear()

            current_people_list = sorted(list(tracked_people.keys()))
            people_changed = current_people_list != prev_people_list
            
            effective_count = max(1, count) if is_occupied else 0
            count_changed = effective_count != prev_person_count
            
            # Print current frame status to console
            state_str = "OCCUPIED" if is_occupied else "AVAILABLE"
            time_str = datetime.now().strftime("%H:%M:%S")
            tracked_str = ", ".join(current_people_list) if current_people_list else "none"
            print(
                f"[{time_str}] [{room_name}] People detected: {count} (Effective: {effective_count}) | Faces detected: {face_count} | "
                f"Tracked People: {tracked_str} | Smoothed State: {state_str} (Conf: {max_conf:.2f})"
            )
            
            # Publish to API if room occupancy state transitioned, tracked people list changed, or person count changed
            if state_changed or people_changed or count_changed:
                print(f"[{room_name}] Status updated (state_changed={state_changed}, people_changed={people_changed}, count_changed={count_changed})! Publishing update...")
                # Run publish asynchronously or simple blocking since timeout is short
                publisher.publish(source_url, is_occupied, current_people_list, effective_count)
                prev_people_list = current_people_list
                prev_person_count = effective_count
                
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
    booking_reset_frames = config.get("booking_reset_frames", 15)
    
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
            args=(source_url, detector, publisher, sample_interval, smoothing, booking_reset_frames, stop_event),
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
