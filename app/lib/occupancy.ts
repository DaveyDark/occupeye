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
  | "not_configured"
  | "unknown";

export type RoomStatus = RoomDefinition & {
  state: RoomOccupancyState;
  timestamp: string | null;
  people?: string[];
  personCount?: number;
  isBooked?: boolean;
  bookedBy?: string;
  bookedAt?: string;
};

export type OccupancyEvent = {
  roomUrl: string;
  occupied: boolean | null;
  people?: string[];
  personCount?: number;
  timestamp?: string | number | Date | null;
};

export const ROOM_DIRECTORY: RoomDefinition[] = [
  {
    roomName: "Delta",
    roomUrl: "test_videos/27095-361827464_medium.mp4",
    layout: {
      left: "25%",
      top: "0%",
      width: "18%",
      height: "14%",
    },
  },
  {
    roomName: "Theta",
    roomUrl: "test_videos/286879_medium.mp4",
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
    roomUrl: "test_videos/27091-361827476_medium.mp4",
    layout: {
      left: "0%",
      top: "42%",
      width: "21%",
      height: "20%",
    },
  },
  {
    roomName: "Alpha",
    roomUrl: "test_videos/1191-143842658_medium.mp4",
    layout: {
      left: "0%",
      top: "61%",
      width: "21%",
      height: "20%",
    },
  },
];

export const CONFIGURED_ROOMS = ROOM_DIRECTORY.filter(
  (room): room is RoomDefinition & { roomUrl: string } => typeof room.roomUrl === "string",
);

export const ROOM_LOOKUP = new Map(
  CONFIGURED_ROOMS.map((room) => [room.roomUrl, room] as const),
);

export const createInitialStatus = (room: RoomDefinition): RoomStatus => ({
  ...room,
  state: room.roomUrl ? "unknown" : "not_configured",
  timestamp: null,
  people: [],
  personCount: 0,
});