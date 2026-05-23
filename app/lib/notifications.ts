import fs from "fs";
import path from "path";

import nodemailer from "nodemailer";

import { ROOM_DIRECTORY } from "./occupancy";

export type RoomNotificationSubscription = {
  roomName: string;
  roomUrl: string | null;
  email: string;
  createdAt: string;
};

type NotificationStore = Record<string, RoomNotificationSubscription[]>;

const NOTIFICATIONS_FILE = path.join(process.cwd(), "data", "notifications.json");
const dispatchLocks = new Set<string>();

function ensureDataDirectory() {
  const dir = path.dirname(NOTIFICATIONS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadNotificationStore(): NotificationStore {
  try {
    ensureDataDirectory();

    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(NOTIFICATIONS_FILE, "utf-8");
    return (JSON.parse(raw) as NotificationStore) || {};
  } catch (error) {
    console.error("Failed to read notification store:", error);
    return {};
  }
}

function saveNotificationStore(store: NotificationStore) {
  try {
    ensureDataDirectory();
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write notification store:", error);
  }
}

export function resolveRoomForNotification(roomName?: string | null, roomUrl?: string | null) {
  const normalizedRoomName = roomName?.trim();
  const normalizedRoomUrl = roomUrl?.trim();

  if (normalizedRoomName) {
    const byName = ROOM_DIRECTORY.find(
      (room) => room.roomName.toLowerCase() === normalizedRoomName.toLowerCase(),
    );

    if (byName) {
      return byName;
    }
  }

  if (normalizedRoomUrl) {
    const byUrl = ROOM_DIRECTORY.find((room) => room.roomUrl === normalizedRoomUrl);

    if (byUrl) {
      return byUrl;
    }
  }

  return null;
}

export function addRoomNotificationSubscription(roomName: string, roomUrl: string | null, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const store = loadNotificationStore();
  const existing = store[roomName] ?? [];
  const deduped = existing.filter((entry) => entry.email !== normalizedEmail);

  const subscription: RoomNotificationSubscription = {
    roomName,
    roomUrl,
    email: normalizedEmail,
    createdAt: new Date().toISOString(),
  };

  deduped.push(subscription);
  store[roomName] = deduped;
  saveNotificationStore(store);

  return subscription;
}

export function getRoomNotificationSubscriptions(roomName: string) {
  const store = loadNotificationStore();
  return store[roomName] ?? [];
}

export async function notifyRoomFreed(room: { roomName: string; roomUrl?: string | null; timestamp?: string | null }) {
  if (dispatchLocks.has(room.roomName)) {
    return { sent: 0, failed: 0, skipped: true };
  }

  dispatchLocks.add(room.roomName);

  try {
    const store = loadNotificationStore();
    const subscriptions = store[room.roomName] ?? [];

    if (!subscriptions.length) {
      return { sent: 0, failed: 0, skipped: true };
    }

    const smtpUser = pickEnv(["SMTP_USER", "SMTP_USERNAME"]);
    const smtpPass = pickEnv(["SMTP_PASS", "SMTP_PASSWORD"]);
    const smtpHost = pickEnv(["SMTP_HOST", "SMTP_SERVER"]) || "smtp.gmail.com";
    const smtpPort = Number(pickEnv(["SMTP_PORT"]) || "587");
    const smtpSecure = String(pickEnv(["SMTP_SECURE"]) || "false").toLowerCase() === "true";

    if (!smtpUser || !smtpPass) {
      console.warn(`[notifications] SMTP credentials missing. Skipping room-free emails for ${room.roomName}.`);
      return { sent: 0, failed: subscriptions.length, skipped: true };
    }

    const fromAddress = pickEnv(["SMTP_FROM", "SMTP_FROM_EMAIL"]) || smtpUser;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isFinite(smtpPort) ? smtpPort : 587,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const remaining: RoomNotificationSubscription[] = [];
    let sent = 0;

    for (const subscription of subscriptions) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: subscription.email,
          subject: `${room.roomName} is free now`,
          text: [
            `The room ${room.roomName} is now free.`,
            room.roomUrl ? `Source: ${room.roomUrl}` : null,
            room.timestamp ? `Updated at: ${room.timestamp}` : null,
            "",
            "This notification was sent because you subscribed to room availability alerts in OccupEye.",
          ]
            .filter(Boolean)
            .join("\n"),
        });

        sent += 1;
      } catch (error) {
        remaining.push(subscription);
        console.error(
          `[notifications] Failed to email ${subscription.email} for room ${room.roomName}:`,
          error,
        );
      }
    }

    if (remaining.length > 0) {
      store[room.roomName] = remaining;
    } else {
      delete store[room.roomName];
    }

    saveNotificationStore(store);

    return { sent, failed: remaining.length, skipped: false };
  } finally {
    dispatchLocks.delete(room.roomName);
  }
}

function pickEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}