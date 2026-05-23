import { getBookings } from "./db";
import {
  ROOM_DIRECTORY,
  ROOM_LOOKUP,
  createInitialStatus,
  type RoomStatus,
  type OccupancyEvent,
} from "./occupancy";

const PROBABLY_EMPTY_TIMEOUT_MS = 2 * 60 * 1000;

// Cache map globally to survive Next.js dev server hot reloading
const globalState = globalThis as unknown as {
  roomStateStore: Map<string, RoomStatus>;
};

if (!globalState.roomStateStore) {
  const CONFIGURED_ROOMS = ROOM_DIRECTORY.filter(
    (room): room is typeof room & { roomUrl: string } => typeof room.roomUrl === "string"
  );
  globalState.roomStateStore = new Map(
    CONFIGURED_ROOMS.map((room) => [room.roomUrl, createInitialStatus(room)] as const)
  );
}

const roomStateStore = globalState.roomStateStore;

export function getAllRoomStatuses(): RoomStatus[] {
  const bookings = getBookings();
  return ROOM_DIRECTORY.map((room) => {
    const status = room.roomUrl ? resolveRoomStatus(room.roomUrl) : createInitialStatus(room);
    const booking = bookings[room.roomName];
    return {
      ...status,
      isBooked: !!booking,
      bookedBy: booking?.bookedBy,
      bookedAt: booking?.bookedAt,
    };
  });
}

export function updateRoomStatus(event: OccupancyEvent): RoomStatus {
  const room = ROOM_LOOKUP.get(event.roomUrl);

  if (!room) {
    throw new Error(`Unknown room-url: ${event.roomUrl}`);
  }

  const eventTimestamp = normalizeTimestamp(event.timestamp) ?? new Date().toISOString();
  const currentStatus = resolveRoomStatus(room.roomUrl, eventTimestamp);
  
  if (event.occupied === null) {
    const nextStatus: RoomStatus = {
      ...room,
      state: "unknown",
      timestamp: eventTimestamp,
      people: [],
      personCount: 0,
    };
    roomStateStore.set(room.roomUrl, nextStatus);
    return nextStatus;
  }
  
  const people = event.occupied ? (event.people ?? []) : [];
  const personCount = event.occupied ? (event.personCount ?? Math.max(1, people.length)) : 0;
  
  const nextStatus: RoomStatus = event.occupied
    ? {
        ...room,
        state: "occupied",
        timestamp: eventTimestamp,
        people,
        personCount,
      }
    : {
        ...currentStatus,
        ...room,
        state: "probably_empty",
        timestamp: eventTimestamp,
        people: [],
        personCount: 0,
      };

  roomStateStore.set(room.roomUrl, nextStatus);

  return nextStatus;
}

export function resolveRoomStatus(
  roomUrl: string,
  referenceTime: string | number | Date = new Date(),
): RoomStatus {
  const room = ROOM_LOOKUP.get(roomUrl);

  if (!room) {
    throw new Error(`Unknown room-url: ${roomUrl}`);
  }

  const existingStatus = roomStateStore.get(roomUrl) ?? createInitialStatus(room);

  if (existingStatus.state !== "probably_empty") {
    return existingStatus;
  }

  const pendingSince = existingStatus.timestamp ? new Date(existingStatus.timestamp).getTime() : NaN;
  const currentTime = referenceTime instanceof Date
    ? referenceTime.getTime()
    : new Date(referenceTime).getTime();

  if (Number.isNaN(pendingSince) || Number.isNaN(currentTime)) {
    return existingStatus;
  }

  if (currentTime - pendingSince < PROBABLY_EMPTY_TIMEOUT_MS) {
    return existingStatus;
  }

  const resolvedStatus: RoomStatus = {
    ...room,
    state: "free",
    timestamp: new Date(currentTime).toISOString(),
    people: [],
    personCount: 0,
  };

  roomStateStore.set(roomUrl, resolvedStatus);

  return resolvedStatus;
}

function normalizeTimestamp(value: OccupancyEvent["timestamp"]): string | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? String(value) : parsedDate.toISOString();
}
