import requests
import time
import sys

BASE_URL = "http://localhost:3000"

def get_rooms():
    r = requests.get(f"{BASE_URL}/api/occupancy")
    if r.status_code == 200:
        return r.json().get("rooms", [])
    return []

def get_bookings():
    r = requests.get(f"{BASE_URL}/api/bookings")
    if r.status_code == 200:
        return r.json().get("bookings", {})
    return {}

def book_room(room_name, user_name):
    payload = {"roomName": room_name, "bookedBy": user_name}
    r = requests.post(f"{BASE_URL}/api/bookings", json=payload)
    if r.status_code == 200:
        print(f"Successfully booked {room_name} for {user_name}")
        return True
    else:
        print(f"Failed to book {room_name}: {r.text}")
        return False

def main():
    print("Fetching initial bookings:")
    initial_bookings = get_bookings()
    print(initial_bookings)
    
    # We want to book Alpha
    room_to_book = "Alpha"
    user = "TestUser"
    
    print(f"\nReserving {room_to_book}...")
    if not book_room(room_to_book, user):
        sys.exit(1)
        
    print("\nVerifying reservation in bookings:")
    bookings_after = get_bookings()
    print(bookings_after)
    
    print("\nVerifying reservation in occupancy API:")
    rooms = get_rooms()
    for room in rooms:
        if room.get("roomName") == room_to_book:
            print(f"Room: {room.get('roomName')}")
            print(f"  isBooked: {room.get('isBooked')}")
            print(f"  bookedBy: {room.get('bookedBy')}")
            print(f"  state: {room.get('state')}")
            break
            
    print("\nWaiting for 35 seconds to let backend detect lack of occupancy and auto-release (reset limit is 15 frames @ 2.0s = 30s)...")
    for i in range(7):
        time.sleep(5)
        print(f"  Passed {5 * (i + 1)} seconds...")
        
    print("\nChecking bookings after wait:")
    final_bookings = get_bookings()
    print(final_bookings)
    if room_to_book not in final_bookings:
        print("\nSUCCESS! The room booking was automatically released by the backend!")
    else:
        print("\nFAILURE: Booking is still active.")

if __name__ == "__main__":
    main()
