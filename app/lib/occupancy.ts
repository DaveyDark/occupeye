export type RoomDefinition = {
  roomName: string;
  roomUrl?: string;
  layout: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
};

export type RoomOccupancyState =
  | "occupied"
  | "probably_empty"
  | "free"
  | "not_configured";

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
  {
    roomName: "Delta",
    layout: {
      left: "25%",
      top: "0%",
      width: "18%",
      height: "14%",
    },
  },
  {
    roomName: "Theta",
    layout: {
      left: "43%",
      top: "7%",
      width: "17%",
      height: "14%",
    },
  },
  {
    roomName: "Sigma",
    layout: {
      left: "83%",
      top: "0%",
      width: "17%",
      height: "16%",
    },
  },
  {
    roomName: "Pi",
    layout: {
      left: "83%",
      top: "17%",
      width: "17%",
      height: "16%",
    },
  },
  {
    roomName: "Townhall",
    layout: {
      left: "83%",
      top: "66%",
      width: "17%",
      height: "25%",
    },
  },
  {
    roomName: "Gamma",
    roomUrl: "rtsp://192.168.2.226:1945",
    layout: {
      left: "0%",
      top: "23%",
      width: "21%",
      height: "20%",
    },
  },
  {
    roomName: "Beta",
    layout: {
      left: "0%",
      top: "42%",
      width: "21%",
      height: "20%",
    },
  },
  {
    roomName: "Alpha",
    layout: {
      left: "0%",
      top: "61%",
      width: "21%",
      height: "20%",
    },
  },
];

const CONFIGURED_ROOMS = ROOM_DIRECTORY.filter(
  (room): room is RoomDefinition & { roomUrl: string } => typeof room.roomUrl === "string",
);

const ROOM_LOOKUP = new Map(
  CONFIGURED_ROOMS.map((room) => [room.roomUrl, room] as const),
);

const createInitialStatus = (room: RoomDefinition): RoomStatus => ({
  ...room,
  state: room.roomUrl ? "free" : "not_configured",
  timestamp: null,
});

const roomStateStore = new Map(
  CONFIGURED_ROOMS.map((room) => [room.roomUrl, createInitialStatus(room)] as const),
);

export function getAllRoomStatuses(): RoomStatus[] {
  return ROOM_DIRECTORY.map((room) =>
    room.roomUrl ? resolveRoomStatus(room.roomUrl) : createInitialStatus(room),
  );
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