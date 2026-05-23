import os

import cv2
import numpy as np


class FaceDetector:
    """
    Lightweight face detector built on OpenCV's Haar cascade.

    It can scan the full frame or a list of person bounding boxes so the
    detector focuses on likely face regions first.
    """

    def __init__(
        self,
        cascade_path: str | None = None,
        scale_factor: float = 1.1,
        min_neighbors: int = 5,
        min_size: tuple[int, int] = (30, 30),
    ):
        self.cascade_path = cascade_path or os.path.join(
            cv2.data.haarcascades,
            "haarcascade_frontalface_default.xml",
        )
        self.scale_factor = scale_factor
        self.min_neighbors = min_neighbors
        self.min_size = min_size

        self.classifier = cv2.CascadeClassifier(self.cascade_path)
        if self.classifier.empty():
            raise IOError(f"Failed to load face cascade: {self.cascade_path}")

    def detect(
        self,
        frame: np.ndarray,
        rois: list[list[int]] | None = None,
    ) -> dict:
        """
        Detects faces in a frame.

        Args:
            frame: Input BGR frame.
            rois: Optional list of [x1, y1, x2, y2] person boxes to search inside.

        Returns:
            A dictionary with:
                - count: number of detected faces
                - detections: list of face detections with mapped boxes
        """
        if frame is None:
            return {"count": 0, "detections": []}

        if rois:
            detections: list[dict] = []
            for roi in rois:
                detections.extend(self._detect_in_roi(frame, roi))
        else:
            detections = self._detect_in_roi(frame, None)

        return {
            "count": len(detections),
            "detections": detections,
        }

    def draw_detections(self, frame: np.ndarray, face_results: dict) -> np.ndarray:
        """
        Annotates a frame with face boxes for debugging.
        """
        annotated_frame = frame.copy()

        for detection in face_results.get("detections", []):
            x1, y1, x2, y2 = detection["box"]
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 215, 255), 2)
            cv2.putText(
                annotated_frame,
                "Face",
                (x1, max(y1 - 10, 15)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 215, 255),
                2,
            )

        return annotated_frame

    def _detect_in_roi(
        self,
        frame: np.ndarray,
        roi: list[int] | None,
    ) -> list[dict]:
        if roi is not None:
            x1, y1, x2, y2 = self._normalize_roi(frame, roi)
            if x2 <= x1 or y2 <= y1:
                return []

            crop = frame[y1:y2, x1:x2]
            offset_x = x1
            offset_y = y1
        else:
            crop = frame
            offset_x = 0
            offset_y = 0

        if crop.size == 0:
            return []

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        if gray.shape[0] < self.min_size[1] or gray.shape[1] < self.min_size[0]:
            return []

        gray = cv2.equalizeHist(gray)

        try:
            faces = self.classifier.detectMultiScale(
                gray,
                scaleFactor=self.scale_factor,
                minNeighbors=self.min_neighbors,
                minSize=self.min_size,
            )
        except cv2.error:
            faces = []

        detections: list[dict] = []
        for (x, y, width, height) in faces:
            detections.append(
                {
                    "box": [
                        int(x + offset_x),
                        int(y + offset_y),
                        int(x + width + offset_x),
                        int(y + height + offset_y),
                    ]
                }
            )

        return detections

    def _normalize_roi(self, frame: np.ndarray, roi: list[int]) -> tuple[int, int, int, int]:
        if len(roi) != 4:
            raise ValueError("ROI must be a 4-item list: [x1, y1, x2, y2]")

        height, width = frame.shape[:2]
        x1 = max(0, min(int(roi[0]), width))
        y1 = max(0, min(int(roi[1]), height))
        x2 = max(0, min(int(roi[2]), width))
        y2 = max(0, min(int(roi[3]), height))

        return x1, y1, x2, y2