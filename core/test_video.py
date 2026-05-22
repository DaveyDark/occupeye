import cv2
import os
import time
from sources.video import VideoSource
from detector.yolo import YoloDetector

def process_video(video_path: str, output_dir: str, sample_interval: float = 2.0):
    """
    Processes a video file, runs person detection at intervals,
    and writes an annotated video output.
    """
    if not os.path.exists(video_path):
        print(f"Error: Video file '{video_path}' not found.")
        return
        
    os.makedirs(output_dir, exist_ok=True)
    video_filename = os.path.basename(video_path)
    output_path = os.path.join(output_dir, f"detected_{video_filename}")
    
    # Initialize sources and detector
    source = VideoSource(video_path, sample_interval=sample_interval)
    detector = YoloDetector(model_path="yolov8n.pt", confidence_threshold=0.5)
    
    # Set up VideoWriter
    # We will output at 1 FPS so each frame is readable in the output video
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out_writer = cv2.VideoWriter(output_path, fourcc, 1.0, (source.width, source.height))
    
    print(f"\nProcessing '{video_filename}' and writing output to '{output_path}'...")
    print(f"{'Timestamp (s)':<15}{'Time (HH:MM:SS)':<18}{'People Count':<15}{'Max Conf':<10}")
    print("-" * 58)
    
    start_time = time.time()
    frames_processed = 0
    total_people_detected = 0
    
    try:
        while True:
            success, frame, timestamp = source.get_next_frame()
            if not success:
                break
                
            # Run detection
            results = detector.detect(frame)
            count = results["count"]
            max_conf = results["max_confidence"]
            
            # Format timestamp to HH:MM:SS
            formatted_time = time.strftime('%H:%M:%S', time.gmtime(timestamp))
            print(f"{timestamp:<15.2f}{formatted_time:<18}{count:<15}{max_conf:<10.2f}")
            
            # Annotate and save to video writer
            annotated_frame = detector.draw_detections(frame, results)
            out_writer.write(annotated_frame)
            
            frames_processed += 1
            total_people_detected += count
            
    finally:
        source.release()
        out_writer.release()
        
    elapsed = time.time() - start_time
    avg_count = total_people_detected / max(1, frames_processed)
    print("-" * 58)
    print(f"Finished processing in {elapsed:.2f} seconds.")
    print(f"Frames processed: {frames_processed}")
    print(f"Average occupancy: {avg_count:.2f} people")
    print(f"Annotated video saved to: {output_path}\n")


def main():
    test_videos_dir = "test_videos"
    output_dir = "output"
    
    # Find all mp4 files in test_videos
    if not os.path.exists(test_videos_dir):
        print(f"Error: Directory '{test_videos_dir}' does not exist.")
        return
        
    videos = sorted([f for f in os.listdir(test_videos_dir) if f.endswith(".mp4")])
    if not videos:
        print(f"No MP4 files found in '{test_videos_dir}'.")
        return
        
    print(f"Found {len(videos)} test videos. Processing all of them...")
    
    for idx, video_file in enumerate(videos):
        video_path = os.path.join(test_videos_dir, video_file)
        print(f"\n==================================================")
        print(f"[{idx+1}/{len(videos)}] Processing: {video_file}")
        print(f"==================================================")
        process_video(video_path, output_dir, sample_interval=2.0)


if __name__ == "__main__":
    main()
