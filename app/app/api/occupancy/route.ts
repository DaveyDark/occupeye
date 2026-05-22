import { NextResponse } from "next/server";

import { getAllRoomStatuses, updateRoomStatus } from "@/lib/occupancy";

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
    const occupied = payload.occupied;
    const timestamp = isTimestampInput(payload.timestamp) ? payload.timestamp : null;

    if (!roomUrl) {
      return NextResponse.json(
        { error: "Missing room-url" },
        { status: 400 },
      );
    }

    if (typeof occupied !== "boolean") {
      return NextResponse.json(
        { error: "occupied must be a boolean" },
        { status: 400 },
      );
    }

    const room = updateRoomStatus({
      roomUrl,
      occupied,
      timestamp,
    });

    return NextResponse.json({
      ok: true,
      room,
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