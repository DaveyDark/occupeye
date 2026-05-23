import fs from "fs";
import path from "path";

// Define the file paths
const DB_FILE = path.join(process.cwd(), "data", "people_history.json");
const BOOKINGS_FILE = path.join(process.cwd(), "data", "bookings.json");
const GALLERY_DIR = path.resolve(process.cwd(), "../core/faces");

export interface PersonRecord {
  name: string;
  lastSeenLocation: string; // Room Name (e.g. "Gamma")
  lastSeenTimestamp: string | null; // ISO Date String
  imageCount?: number;
}

// Ensure the data directory exists
function ensureDbDirectory() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Load history from JSON file
export function getHistory(): Record<string, Omit<PersonRecord, "name" | "imageCount">> {
  try {
    ensureDbDirectory();
    if (!fs.existsSync(DB_FILE)) {
      return {};
    }
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data) || {};
  } catch (error) {
    console.error("Failed to read history database:", error);
    return {};
  }
}

// Save history to JSON file
export function saveHistory(history: Record<string, Omit<PersonRecord, "name" | "imageCount">>) {
  try {
    ensureDbDirectory();
    fs.writeFileSync(DB_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write history database:", error);
  }
}

// Get the list of all registered people in the gallery
export function getRegisteredPeople(): string[] {
  try {
    if (!fs.existsSync(GALLERY_DIR)) {
      console.warn(`Gallery directory not found at: ${GALLERY_DIR}`);
      return [];
    }
    const files = fs.readdirSync(GALLERY_DIR, { withFileTypes: true });
    return files
      .filter((file) => file.isDirectory())
      .map((dir) => dir.name);
  } catch (error) {
    console.error("Failed to read registered face gallery directory:", error);
    return [];
  }
}

// Get all people with their merged registry and history
export function getAllPeople(): PersonRecord[] {
  const history = getHistory();
  const registered = getRegisteredPeople();
  
  // Set to keep track of everyone
  const allNames = new Set([...registered, ...Object.keys(history)]);
  
  return Array.from(allNames).map((name) => {
    const record = history[name];
    let imageCount = 0;
    
    try {
      const personDir = path.join(GALLERY_DIR, name);
      if (fs.existsSync(personDir) && fs.statSync(personDir).isDirectory()) {
        const files = fs.readdirSync(personDir);
        // Filter image files
        imageCount = files.filter((f) => /\.(jpe?g|png|webp|bmp)$/i.test(f)).length;
      }
    } catch (e) {
      // Ignore directory read errors
    }

    return {
      name,
      lastSeenLocation: record?.lastSeenLocation ?? "Never seen",
      lastSeenTimestamp: record?.lastSeenTimestamp ?? null,
      imageCount,
    };
  });
}

// Update the last seen status for a list of people
export function updateLastSeen(people: string[], location: string, timestamp: string) {
  if (!people || people.length === 0) return;
  
  const history = getHistory();
  let changed = false;
  
  people.forEach((name) => {
    if (!name || name.trim() === "" || name.toLowerCase() === "unknown") return;
    
    // Only update if the timestamp is newer or not set
    const current = history[name];
    if (!current || !current.lastSeenTimestamp || new Date(timestamp) >= new Date(current.lastSeenTimestamp)) {
      history[name] = {
        lastSeenLocation: location,
        lastSeenTimestamp: timestamp,
      };
      changed = true;
    }
  });
  
  if (changed) {
    saveHistory(history);
  }
}

export interface BookingRecord {
  roomName: string;
  bookedBy: string;
  bookedAt: string;
}

// Load bookings from JSON file
export function getBookings(): Record<string, BookingRecord> {
  try {
    ensureDbDirectory();
    if (!fs.existsSync(BOOKINGS_FILE)) {
      return {};
    }
    const data = fs.readFileSync(BOOKINGS_FILE, "utf-8");
    return JSON.parse(data) || {};
  } catch (error) {
    console.error("Failed to read bookings database:", error);
    return {};
  }
}

// Save bookings to JSON file
export function saveBookings(bookings: Record<string, BookingRecord>) {
  try {
    ensureDbDirectory();
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write bookings database:", error);
  }
}

// Reserve a room
export function addBooking(roomName: string, bookedBy: string): BookingRecord {
  const bookings = getBookings();
  const newBooking: BookingRecord = {
    roomName,
    bookedBy,
    bookedAt: new Date().toISOString(),
  };
  bookings[roomName] = newBooking;
  saveBookings(bookings);
  return newBooking;
}

// Cancel a reservation
export function removeBooking(roomName: string): boolean {
  const bookings = getBookings();
  if (bookings[roomName]) {
    delete bookings[roomName];
    saveBookings(bookings);
    return true;
  }
  return false;
}
