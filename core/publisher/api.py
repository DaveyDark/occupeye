import requests
from datetime import datetime, timezone

class ApiPublisher:
    """
    Handles publishing occupancy state changes to the target Next.js API endpoint.
    """
    def __init__(self, api_url: str):
        """
        Initializes the publisher.
        
        Args:
            api_url: The target HTTP POST endpoint.
        """
        self.api_url = api_url
        print(f"[ApiPublisher] Initialized with endpoint: {self.api_url}")

    def publish(self, room_url: str, is_occupied: bool | None, people: list[str] | None = None, person_count: int = 0) -> bool:
        """
        Publishes the occupancy state of a room to the configured API.
        
        Args:
            room_url: The RTSP stream URL or local video path identifying the camera feed.
            is_occupied: True if room is occupied, False if available, None if unknown/unconnected.
            people: Optional list of names of recognized individuals in the room.
            person_count: The total number of people detected in the room.
            
        Returns:
            True if the publish request succeeded, False otherwise.
        """
        # ISO-8601 UTC timestamp format (e.g., 2026-05-22T18:30:00.000Z)
        timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        
        payload = {
            "room-url": room_url,
            "occupied": is_occupied,
            "people": people or [],
            "person-count": person_count,
            "timestamp": timestamp
        }
        
        print(f"[ApiPublisher] Publishing update: {payload}")
        
        try:
            # 5-second timeout to prevent blocking thread execution
            response = requests.post(self.api_url, json=payload, timeout=5.0)
            
            if response.status_code in (200, 201):
                print(f"[ApiPublisher] Success! Response {response.status_code}")
                return True
            else:
                print(f"[ApiPublisher] Warning: API returned status code {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"[ApiPublisher] Error: Failed to connect to API ({e}). Stream tracking will continue.")
            return False
