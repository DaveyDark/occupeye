import { NextResponse } from "next/server";

import { getAllRoomStatuses, updateRoomStatus } from "@/lib/occupancy-server";
import { updateLastSeen, getBookings } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    rooms: getAllRoomStatuses(),
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const roomUrl = String(payload["room-url"] ?? payload.roomUrl ?? "").trim();
    
    const rawOccupied = payload.occupied;
    const occupied = rawOccupied === null ? null : (typeof rawOccupied === "boolean" ? rawOccupied : undefined);
    
    const people = Array.isArray(payload.people) ? payload.people.map(String) : [];
    
    // Parse personCount support both camelCase and kebab-case
    const rawPersonCount = payload["person-count"] ?? payload.personCount;
    const personCount = typeof rawPersonCount === "number" ? rawPersonCount : undefined;
    
    const timestamp = isTimestampInput(payload.timestamp) ? payload.timestamp : null;

    if (!roomUrl) {
      return NextResponse.json(
        { error: "Missing room-url" },
        { status: 400 },
      );
    }

    if (occupied === undefined) {
      return NextResponse.json(
        { error: "occupied must be a boolean or null" },
        { status: 400 },
      );
    }

    const room = updateRoomStatus({
      roomUrl,
      occupied,
      people,
      personCount,
      timestamp,
    });

    // Record last seen details for identified individuals
    if (occupied && people.length > 0) {
      updateLastSeen(people, room.roomName, room.timestamp ?? new Date().toISOString());
    }

    const bookings = getBookings();
    const booking = bookings[room.roomName];
    const roomWithBooking = {
      ...room,
      isBooked: !!booking,
      bookedBy: booking?.bookedBy,
      bookedAt: booking?.bookedAt,
    };

    return NextResponse.json({
      ok: true,
      room: roomWithBooking,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update room";

    return NextResponse.json({ error: message }, { status: 404 });
  }
}

function isTimestampInput(
  value: unknown,
): value is string | number | Date | null | undefined {
  return (
    value === null ||
    typeof value === "undefined" ||
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  );
}