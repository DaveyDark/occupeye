import { NextResponse } from "next/server";

import { addRoomNotificationSubscription, resolveRoomForNotification } from "@/lib/notifications";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const email = String(payload.email ?? "").trim();
    const roomName = payload.roomName ? String(payload.roomName).trim() : null;
    const roomUrl = payload.roomUrl ? String(payload.roomUrl).trim() : null;

    if (!email || !isEmail(email)) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }

    const room = resolveRoomForNotification(roomName, roomUrl);

    if (!room) {
      return NextResponse.json({ error: "A valid roomName or roomUrl is required" }, { status: 400 });
    }

    const subscription = addRoomNotificationSubscription(room.roomName, room.roomUrl ?? null, email);

    return NextResponse.json({
      ok: true,
      subscription,
      message: `We will email ${subscription.email} when ${room.roomName} becomes free.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create notification subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}