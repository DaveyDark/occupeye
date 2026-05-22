export type RoomDefinition = {
  roomUrl: string;
  roomName: string;
};

export type RoomStatus = RoomDefinition & {
  occupied: boolean;
  timestamp: string | null;
};

export type OccupancyEvent = {
  roomUrl: string;
  occupied: boolean;
  timestamp?: string | number | Date | null;
};

export const ROOM_DIRECTORY: RoomDefinition[] = [
  { roomUrl: "conference-room-a", roomName: "Conference Room A" },
  { roomUrl: "conference-room-b", roomName: "Conference Room B" },
  { roomUrl: "focus-room-1", roomName: "Focus Room 1" },
  { roomUrl: "focus-room-2", roomName: "Focus Room 2" },
  { roomUrl: "lobby", roomName: "Lobby" },
  { roomUrl: "breakout-space", roomName: "Breakout Space" },
];

const ROOM_LOOKUP = new Map(
  ROOM_DIRECTORY.map((room) => [room.roomUrl, room] as const),
);

const createInitialStatus = (room: RoomDefinition): RoomStatus => ({
  ...room,
  occupied: false,
  timestamp: null,
});

const roomStateStore = new Map(
  ROOM_DIRECTORY.map((room) => [room.roomUrl, createInitialStatus(room)] as const),
);

export function getAllRoomStatuses(): RoomStatus[] {
  return ROOM_DIRECTORY.map(
    (room) => roomStateStore.get(room.roomUrl) ?? createInitialStatus(room),
  );
}

export function updateRoomStatus(event: OccupancyEvent): RoomStatus {
  const room = ROOM_LOOKUP.get(event.roomUrl);

  if (!room) {
    throw new Error(`Unknown room-url: ${event.roomUrl}`);
  }

  const timestamp = normalizeTimestamp(event.timestamp) ?? new Date().toISOString();
  const nextStatus: RoomStatus = {
    ...room,
    occupied: event.occupied,
    timestamp,
  };

  roomStateStore.set(room.roomUrl, nextStatus);

  return nextStatus;
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