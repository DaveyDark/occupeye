# OccupEye – Vision & Core Service

This is the Python-based vision service of OccupEye. It processes camera feeds (live RTSP streams or local video files), runs person detection using a lightweight YOLOv8 model, detects faces, optionally identifies known people from a local gallery, applies temporal smoothing to determine room occupancy status, and publishes state changes to the central Next.js API.

---

## 🛠️ Prerequisites

Make sure you have the following installed on your machine:
* **Python 3.12+**
* **uv** (a fast Python package manager and resolver). If not installed, you can get it via:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

---

## 🚀 Setup & Installation

1. **Install Dependencies**:
   Run the following command inside the `core/` directory to create a virtual environment (`.venv`) and install all required packages (OpenCV, Ultralytics YOLOv8, Requests, etc.):
   ```bash
   uv sync
   ```

2. **YOLO Weights**:
  The YOLOv8n (Nano) model weights (`yolov8n.pt`) will automatically be downloaded on the first run.

3. **OpenCV Face Module**:
  The identity layer uses OpenCV's `cv2.face.LBPHFaceRecognizer`. The required contrib build is included in the Python dependencies.

---

## ⚙️ Configuration (`config.json`)

All runtime settings and room streams are managed in [config.json](config.json) at the root of the `core/` folder.

```json
{
  "api_url": "http://localhost:3000/api/occupancy",
  "sample_interval_seconds": 2.0,
  "smoothing": {
    "positive_threshold": 3,
    "negative_threshold": 10
  },
  "face_recognition": {
    "enabled": true,
    "gallery_dir": "faces",
    "confidence_threshold": 65.0,
    "min_samples_per_person": 2
  },
  "rooms": [
    "rtsp://your-cctv-stream-url:1935/app/stream1",
    "test_videos/27091-361827476_medium.mp4"
  ]
}
```

### Config Parameter Reference:
* `api_url`: The backend endpoint to which occupancy state transitions are POSTed.
* `sample_interval_seconds`: How frequently (in seconds) the system grabs a frame from each camera to run person detection.
* `smoothing.positive_threshold`: Number of consecutive positive samples ($>0$ people) required to mark a room as `OCCUPIED`. (e.g., $3 \times 2\text{s} = 6\text{s}$).
* `smoothing.negative_threshold`: Number of consecutive negative samples ($0$ people) required to mark a room as `AVAILABLE`. (e.g., $10 \times 2\text{s} = 20\text{s}$).
* `face_recognition.enabled`: Turns face identification on or off.
* `face_recognition.gallery_dir`: Folder that contains known-person subfolders with reference images.
* `face_recognition.confidence_threshold`: LBPH confidence cutoff. Lower is better; values above this are treated as `Unknown`.
* `face_recognition.min_samples_per_person`: Minimum number of usable face images required to train a person label.
* `rooms`: A flat list of camera sources. Supports both `rtsp://` / `rtsps://` live URLs and local paths to video files (e.g. `.mp4`).

---

## 🏃 Running the Service

### 1. Run the Multi-Room Tracking Daemon
To spin up the service tracking all cameras in parallel:
```bash
uv run python main.py
```
This spawns a worker thread for each configured stream. On state change, it automatically publishes updates to the Next.js API. If a video file finishes, the daemon loops it automatically to simulate a live camera feed.

### 2. Interactive CLI Tracking (Single Source)
To test or debug a single stream directly in your console:
```bash
uv run python test.py <RTSP_URL_or_video_file_path>
```
*Example:*
```bash
uv run python test.py test_videos/286879_medium.mp4
```

### 3. Face Identification Gallery
Add known people under the `faces/` directory, one subfolder per person:

```text
faces/
  Alice/
    1.jpg
    2.jpg
  Bob/
    1.jpg
```

The service trains a local LBPH model from these images at startup. Each image should contain a clear, front-facing face.

---

## 🧪 Run Diagnostic Test Scripts
There are individual test scripts available for debugging components:

* **Single Image Person Detection Test**:
  ```bash
  uv run python test_detector.py
  ```
  Runs YOLO on `meeting_room.png` and saves the visual result to `meeting_room_detected.png`.

* **Single Source Face Identification Test**:
  ```bash
  uv run python test.py test_videos/286879_medium.mp4
  ```
  Prints people counts, face counts, and any known identities found in the gallery.

* **Local Video Pipeline Test**:
  ```bash
  uv run python test_video.py
  ```
  Runs detection on all videos in `test_videos/` and writes slowed-down visual outputs to `output/`.

* **Live RTSP Stream Connection Test**:
  ```bash
  uv run python test_rtsp.py
  ```
  Validates stream connection, frame grabbing, and buffer flushing against a test RTSP stream.

---

## 📐 Architecture & Performance details

* **Multi-threading with Global Inference Lock**: To avoid thread-safety issues inside PyTorch and maintain a small memory footprint, all worker threads share a single `YoloDetector` instance. Inference operations are serialized via a global lock.
* **RTSP Latency Buffer Flushing**: The RTSP source runs a background grabbing loop that continuously reads raw packages from the network. This prevents OpenCV's buffer from piling up, ensuring that the main thread always retrieves the *latest real-time frame* with zero latency.
* **API Offline Resilience**: If the target API server goes down, the `ApiPublisher` logs connection failures gracefully but does not halt the camera processing threads.
