import cv2
import numpy as np
from ultralytics import YOLO

class YoloDetector:
    """
    A modular YOLOv8 detector class for OccupEye.
    Specifically tuned to detect the 'person' class (COCO class 0).
    """
    def __init__(self, model_path: str = "yolov8n.pt", confidence_threshold: float = 0.5):
        """
        Initializes the YOLOv8 detector.
        
        Args:
            model_path: Path or identifier of the YOLOv8 model (e.g., 'yolov8n.pt').
            confidence_threshold: Minimum confidence score to consider a detection valid.
        """
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        # Load the model. Ultralytics will auto-download the model if not present.
        self.model = YOLO(self.model_path)
        
    def detect(self, frame: np.ndarray, roi: list[int] = None) -> dict:
        """
        Detects persons in a given image/frame.
        
        Args:
            frame: Input image as a numpy array (BGR format, typically from OpenCV).
            roi: Optional Region of Interest as [x, y, w, h]. Detections are restricted to this area.
            
        Returns:
            A dictionary containing:
                - 'count': (int) Number of persons detected.
                - 'max_confidence': (float) Maximum confidence score among all detected persons.
                - 'detections': (list) List of dicts, each with 'box' (x1, y1, x2, y2 relative to original frame)
                                and 'confidence' (float).
        """
        # Determine the area to run detection on
        if roi is not None:
            x, y, w, h = roi
            # Ensure ROI is within frame bounds
            height, width = frame.shape[:2]
            x_start = max(0, min(x, width))
            y_start = max(0, min(y, height))
            x_end = max(0, min(x + w, width))
            y_end = max(0, min(y + h, height))
            
            detection_input = frame[y_start:y_end, x_start:x_end]
            offset_x = x_start
            offset_y = y_start
        else:
            detection_input = frame
            offset_x = 0
            offset_y = 0

        # Run inference. verbose=False disables model print outputs in console.
        results = self.model(detection_input, verbose=False)
        
        persons = []
        max_conf = 0.0
        
        # Parse results
        for result in results:
            boxes = result.boxes
            for box in boxes:
                # Class 0 is 'person' in COCO dataset
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                
                if cls_id == 0 and conf >= self.confidence_threshold:
                    # Bounding box relative to detection_input: [x1, y1, x2, y2]
                    xyxy = box.xyxy[0].tolist()
                    
                    # Map box coordinates back to the original full frame
                    mapped_box = [
                        int(xyxy[0] + offset_x),
                        int(xyxy[1] + offset_y),
                        int(xyxy[2] + offset_x),
                        int(xyxy[3] + offset_y)
                    ]
                    
                    persons.append({
                        "box": mapped_box,
                        "confidence": conf
                    })
                    
                    if conf > max_conf:
                        max_conf = conf
                        
        return {
            "count": len(persons),
            "max_confidence": max_conf,
            "detections": persons
        }
        
    def draw_detections(self, frame: np.ndarray, detection_results: dict, roi: list[int] = None) -> np.ndarray:
        """
        Annotates a frame with bounding boxes and labels for visualization/debugging.
        
        Args:
            frame: Original full-resolution image/frame.
            detection_results: The output dictionary from the detect() method.
            roi: Optional Region of Interest to draw a bounding box around the detection zone.
            
        Returns:
            Annotated frame.
        """
        annotated_frame = frame.copy()
        
        # Draw ROI boundary if specified
        if roi is not None:
            x, y, w, h = roi
            cv2.rectangle(annotated_frame, (x, y), (x + w, y + h), (255, 0, 0), 2)
            cv2.putText(annotated_frame, "ROI", (x + 5, y + 20), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1)
                        
        # Draw detected persons
        for det in detection_results["detections"]:
            x1, y1, x2, y2 = det["box"]
            conf = det["confidence"]
            
            # Draw person bounding box (Green)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Label
            label = f"Person: {conf:.2f}"
            cv2.putText(annotated_frame, label, (x1, max(y1 - 10, 15)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        
        return annotated_frame
