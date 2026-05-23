import os
from dataclasses import dataclass

import cv2
import numpy as np

from detector.face import FaceDetector


@dataclass(frozen=True)
class IdentityMatch:
    name: str
    confidence: float
    box: list[int]
    is_known: bool


class FaceIdentifier:
    """
    Local face identity layer backed by OpenCV LBPH.

    Known identities are loaded from a gallery directory with one subfolder per
    person. The recognizer is trained at startup and can then label detected
    faces in new frames.
    """

    def __init__(
        self,
        gallery_dir: str = "faces",
        confidence_threshold: float = 65.0,
        min_samples_per_person: int = 1,
        image_size: tuple[int, int] = (200, 200),
        cascade_path: str | None = None,
    ):
        self.gallery_dir = self._resolve_gallery_dir(gallery_dir)
        self.confidence_threshold = confidence_threshold
        self.min_samples_per_person = min_samples_per_person
        self.image_size = image_size
        self.face_detector = FaceDetector(cascade_path=cascade_path)
        self.recognizer = self._create_recognizer()
        self.label_to_name: dict[int, str] = {}
        self.is_trained = False

        if self.recognizer is None:
            print(
                "[FaceIdentifier] OpenCV contrib face module is unavailable in this Python environment. "
                "Face identification is disabled. Install opencv-contrib-python in the same interpreter you run, "
                "or launch via the project venv with `uv run python main.py`."
            )
            return

        self._train_from_gallery()

    def identify(self, frame: np.ndarray, face_detections: list[dict]) -> dict:
        """
        Identifies detected faces in a frame.
        """
        if not self.is_trained or frame is None or not face_detections:
            return {
                "recognized_count": 0,
                "recognized_names": [],
                "detections": [],
            }

        matches: list[IdentityMatch] = []
        recognized_names: list[str] = []

        for detection in face_detections:
            box = detection["box"]
            face_patch = self._extract_face_patch(frame, box)
            if face_patch is None:
                continue

            label_id, confidence = self.recognizer.predict(face_patch)
            known_name = self.label_to_name.get(label_id, "Unknown")
            is_known = confidence <= self.confidence_threshold
            name = known_name if is_known else "Unknown"

            matches.append(
                IdentityMatch(
                    name=name,
                    confidence=confidence,
                    box=box,
                    is_known=is_known,
                )
            )

            if is_known and name not in recognized_names:
                recognized_names.append(name)

        return {
            "recognized_count": sum(1 for match in matches if match.is_known),
            "recognized_names": recognized_names,
            "detections": [
                {
                    "box": match.box,
                    "name": match.name,
                    "confidence": match.confidence,
                    "is_known": match.is_known,
                }
                for match in matches
            ],
        }

    def _train_from_gallery(self) -> None:
        if not os.path.isdir(self.gallery_dir):
            print(f"[FaceIdentifier] Gallery directory not found: {self.gallery_dir}. Identification disabled.")
            return

        faces: list[np.ndarray] = []
        labels: list[int] = []
        next_label = 0
        usable_people = 0

        for person_name in sorted(os.listdir(self.gallery_dir)):
            person_dir = os.path.join(self.gallery_dir, person_name)
            if not os.path.isdir(person_dir):
                continue

            face_samples: list[np.ndarray] = []
            for filename in sorted(os.listdir(person_dir)):
                if not self._is_image_file(filename):
                    continue

                image_path = os.path.join(person_dir, filename)
                frame = cv2.imread(image_path)
                if frame is None:
                    continue

                face_patch = self._extract_largest_face(frame)
                if face_patch is None:
                    continue

                face_samples.append(face_patch)

            if len(face_samples) < self.min_samples_per_person:
                print(
                    f"[FaceIdentifier] Skipping {person_name}: need {self.min_samples_per_person} usable face images, got {len(face_samples)}."
                )
                continue

            label = next_label
            next_label += 1
            usable_people += 1
            self.label_to_name[label] = person_name

            for face_sample in face_samples:
                faces.append(face_sample)
                labels.append(label)

        if not faces:
            print(f"[FaceIdentifier] No trainable faces found in {self.gallery_dir}. Identification disabled.")
            return

        self.recognizer.train(faces, np.asarray(labels, dtype=np.int32))
        self.is_trained = True
        print(
            f"[FaceIdentifier] Trained on {len(faces)} face samples across {usable_people} people."
        )

    def _extract_face_patch(self, frame: np.ndarray, box: list[int]) -> np.ndarray | None:
        if len(box) != 4:
            return None

        height, width = frame.shape[:2]
        x1 = max(0, min(int(box[0]), width))
        y1 = max(0, min(int(box[1]), height))
        x2 = max(0, min(int(box[2]), width))
        y2 = max(0, min(int(box[3]), height))

        if x2 <= x1 or y2 <= y1:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        return cv2.resize(gray, self.image_size)

    def _extract_largest_face(self, frame: np.ndarray) -> np.ndarray | None:
        detection = self.face_detector.detect(frame)
        detections = detection.get("detections", [])
        if not detections:
            return None

        largest = max(
            detections,
            key=lambda item: (item["box"][2] - item["box"][0]) * (item["box"][3] - item["box"][1]),
        )
        return self._extract_face_patch(frame, largest["box"])

    def _resolve_gallery_dir(self, gallery_dir: str) -> str:
        if os.path.isabs(gallery_dir):
            return gallery_dir

        core_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(core_dir, gallery_dir)

    @staticmethod
    def _create_recognizer():
        face_module = getattr(cv2, "face", None)
        if face_module is None:
            return None

        create_recognizer = getattr(face_module, "LBPHFaceRecognizer_create", None)
        if create_recognizer is None:
            return None

        return create_recognizer()

    @staticmethod
    def _is_image_file(filename: str) -> bool:
        _, ext = os.path.splitext(filename.lower())
        return ext in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}