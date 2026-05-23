import { NextResponse } from "next/server";
import { getBookings, addBooking, removeBooking } from "@/lib/db";
import { ROOM_DIRECTORY } from "@/lib/occupancy";

// Helper to resolve roomName from roomName or roomUrl
function resolveRoomName(roomName?: string | null, roomUrl?: string | null): string | null {
  if (roomName) {
    const room = ROOM_DIRECTORY.find((r) => r.roomName.toLowerCase() === roomName.toLowerCase());
    return room ? room.roomName : null;
  }
  if (roomUrl) {
    const room = ROOM_DIRECTORY.find((r) => r.roomUrl === roomUrl);
    return room ? room.roomName : null;
  }
  return null;
}

export async function GET() {
  const bookings = getBookings();
  return NextResponse.json({
    bookings,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const rawRoomName = payload.roomName ? String(payload.roomName).trim() : null;
    const rawRoomUrl = payload.roomUrl ? String(payload.roomUrl).trim() : null;
    const bookedBy = payload.bookedBy ? String(payload.bookedBy).trim() : "";

    const roomName = resolveRoomName(rawRoomName, rawRoomUrl);

    if (!roomName) {
      return NextResponse.json(
        { error: "Valid roomName or roomUrl is required" },
        { status: 400 },
      );
    }

    if (!bookedBy) {
      return NextResponse.json(
        { error: "bookedBy name is required" },
        { status: 400 },
      );
    }

    const booking = addBooking(roomName, bookedBy);

    return NextResponse.json({
      ok: true,
      booking,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    let rawRoomName = url.searchParams.get("roomName") || url.searchParams.get("room-name");
    let rawRoomUrl = url.searchParams.get("roomUrl") || url.searchParams.get("room-url");

    // Also support reading from body if query params are missing
    if (!rawRoomName && !rawRoomUrl) {
      try {
        const payload = (await request.json()) as Record<string, unknown>;
        rawRoomName = payload.roomName ? String(payload.roomName).trim() : null;
        rawRoomUrl = payload.roomUrl ? String(payload.roomUrl).trim() : null;
      } catch (e) {
        // No body or invalid json
      }
    }

    const roomName = resolveRoomName(rawRoomName, rawRoomUrl);

    if (!roomName) {
      return NextResponse.json(
        { error: "Valid roomName or roomUrl is required to release reservation" },
        { status: 400 },
      );
    }

    const success = removeBooking(roomName);

    return NextResponse.json({
      ok: true,
      released: success,
      roomName,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to release reservation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
