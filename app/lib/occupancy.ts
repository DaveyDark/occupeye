export type RoomDefinition = {
  roomUrl: string;
  roomName: string;
};

export type RoomOccupancyState = "occupied" | "probably_empty" | "free";

export type RoomStatus = RoomDefinition & {
  state: RoomOccupancyState;
  timestamp: string | null;
};

export type OccupancyEvent = {
  roomUrl: string;
  occupied: boolean;
  timestamp?: string | number | Date | null;
};

const PROBABLY_EMPTY_TIMEOUT_MS = 2 * 60 * 1000;

export const ROOM_DIRECTORY: RoomDefinition[] = [
  { roomUrl: "rtsp://192.168.2.226:1945", roomName: "Room 1" },
];

const ROOM_LOOKUP = new Map(
  ROOM_DIRECTORY.map((room) => [room.roomUrl, room] as const),
);

const createInitialStatus = (room: RoomDefinition): RoomStatus => ({
  ...room,
  state: "free",
  timestamp: null,
});

const roomStateStore = new Map(
  ROOM_DIRECTORY.map((room) => [room.roomUrl, createInitialStatus(room)] as const),
);

export function getAllRoomStatuses(): RoomStatus[] {
  return ROOM_DIRECTORY.map((room) => resolveRoomStatus(room.roomUrl));
}

export function updateRoomStatus(event: OccupancyEvent): RoomStatus {
  const room = ROOM_LOOKUP.get(event.roomUrl);

  if (!room) {
    throw new Error(`Unknown room-url: ${event.roomUrl}`);
  }

  const eventTimestamp = normalizeTimestamp(event.timestamp) ?? new Date().toISOString();
  const currentStatus = resolveRoomStatus(room.roomUrl, eventTimestamp);
  const nextStatus: RoomStatus = event.occupied
    ? {
        ...room,
        state: "occupied",
        timestamp: eventTimestamp,
      }
    : {
        ...currentStatus,
        ...room,
        state: "probably_empty",
        timestamp: eventTimestamp,
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