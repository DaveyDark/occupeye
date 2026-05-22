import cv2
import os

class VideoSource:
    """
    A modular source to read local video files with efficient frame skipping.
    """
    def __init__(self, file_path: str, sample_interval: float = 2.0):
        """
        Initializes the VideoSource.
        
        Args:
            file_path: Path to the video file.
            sample_interval: Frequency of frame extraction in seconds.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Video file not found: {file_path}")
            
        self.file_path = file_path
        self.sample_interval = sample_interval
        
        # Open video capture
        self.cap = cv2.VideoCapture(self.file_path)
        if not self.cap.isOpened():
            raise IOError(f"Failed to open video file: {file_path}")
            
        # Retrieve video properties
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        # Avoid divide by zero if FPS is not detected properly
        if self.fps <= 0:
            self.fps = 30.0
            
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Compute frame step based on the desired sample interval
        self.frame_step = max(1, int(self.fps * self.sample_interval))
        self.current_frame_idx = 0
        
        print(f"[VideoSource] Loaded {file_path}")
        print(f"  - FPS: {self.fps:.2f}")
        print(f"  - Dimensions: {self.width}x{self.height}")
        print(f"  - Total Frames: {self.total_frames}")
        print(f"  - Frame Step for {sample_interval}s interval: {self.frame_step} frames")

    def get_next_frame(self) -> tuple[bool, object, float]:
        """
        Reads the next sampled frame from the video.
        Uses CAP_PROP_POS_FRAMES to skip intermediate frames.
        
        Returns:
            A tuple of (success, frame, timestamp_in_seconds).
            If success is False, frame is None.
        """
        if self.current_frame_idx >= self.total_frames:
            return False, None, 0.0
            
        # Set video cursor position
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, self.current_frame_idx)
        
        success, frame = self.cap.read()
        if not success:
            return False, None, 0.0
            
        timestamp = self.current_frame_idx / self.fps
        
        # Move cursor index forward for the next call
        self.current_frame_idx += self.frame_step
        
        return True, frame, timestamp

    def reset(self):
        """
        Resets the video source back to the beginning.
        """
        self.current_frame_idx = 0
        
    def release(self):
        """
        Releases the video capture resource.
        """
        if self.cap is not None:
            self.cap.release()
