import cv2
import threading
import time

class RtspSource:
    """
    A robust RTSP frame source that uses a background thread to continuously 
    flush the stream buffer, preventing lag and ensuring we always retrieve the 
    most recent real-time frame.
    """
    def __init__(self, rtsp_url: str, reconnect_interval: float = 5.0):
        """
        Initializes the RTSP source.
        
        Args:
            rtsp_url: The RTSP stream URL.
            reconnect_interval: Time (in seconds) to wait before trying to reconnect if the stream drops.
        """
        self.rtsp_url = rtsp_url
        self.reconnect_interval = reconnect_interval
        
        self.cap = None
        self.latest_frame = None
        self.running = False
        self.connected = False
        
        self.lock = threading.Lock()
        self.thread = None
        
        # Start connection & grabbing thread
        self.start()

    def start(self):
        """Starts the frame grabbing background thread."""
        if self.running:
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._grab_loop, daemon=True)
        self.thread.start()

    def _connect(self) -> bool:
        """Helper to establish cv2.VideoCapture connection."""
        if self.cap is not None:
            self.cap.release()
            
        print(f"[RtspSource] Connecting to {self.rtsp_url}...")
        self.cap = cv2.VideoCapture(self.rtsp_url)
        if self.cap.isOpened():
            self.connected = True
            print("[RtspSource] Connection established.")
            return True
        else:
            self.connected = False
            print("[RtspSource] Connection failed.")
            return False

    def _grab_loop(self):
        """Background loop that continuously reads frames to flush buffers and update latest_frame."""
        while self.running:
            if not self.connected or self.cap is None or not self.cap.isOpened():
                if not self._connect():
                    # Wait before attempting reconnect
                    time.sleep(self.reconnect_interval)
                    continue
            
            success, frame = self.cap.read()
            if not success:
                print("[RtspSource] Stream disconnected or failed to read frame. Reconnecting...")
                self.connected = False
                time.sleep(0.5)
                continue
                
            with self.lock:
                self.latest_frame = frame.copy() if frame is not None else None
                
            # Control CPU usage slightly
            time.sleep(0.01)

    def get_next_frame(self) -> tuple[bool, object]:
        """
        Retrieves the latest grabbed frame thread-safely.
        
        Returns:
            A tuple of (success, frame).
        """
        with self.lock:
            if self.latest_frame is None:
                return False, None
            return True, self.latest_frame.copy()

    def is_connected(self) -> bool:
        """Returns True if the stream is currently connected."""
        return self.connected

    def release(self):
        """Stops the grabbing thread and releases OpenCV resources."""
        self.running = False
        if self.thread is not None:
            self.thread.join(timeout=2.0)
            
        if self.cap is not None:
            self.cap.release()
            
        self.connected = False
        print("[RtspSource] Released RTSP resources.")
