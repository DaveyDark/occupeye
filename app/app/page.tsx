"use client";

import { useEffect, useMemo, useState } from "react";

import { ROOM_DIRECTORY, type RoomStatus } from "@/lib/occupancy";

type OccupancyResponse = {
  rooms: RoomStatus[];
  updatedAt: string;
};

const POLL_INTERVAL_MS = 2000;

export default function Home() {
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadRooms = async () => {
      try {
        const response = await fetch("/api/occupancy", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as OccupancyResponse;

        if (!isActive) {
          return;
        }

        setRooms(data.rooms);
        setLastSyncedAt(data.updatedAt);
        setError(null);
        setIsLoading(false);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load room states",
        );
        setIsLoading(false);
      }
    };

    loadRooms();

    const intervalId = window.setInterval(loadRooms, POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const summary = useMemo(() => {
    const occupiedCount = rooms.filter((room) => room.state === "occupied").length;
    const probablyEmptyCount = rooms.filter((room) => room.state === "probably_empty").length;

    return {
      occupiedCount,
      probablyEmptyCount,
      freeCount: rooms.length - occupiedCount - probablyEmptyCount,
    };
  }, [rooms]);

  const displayRooms =
    isLoading && rooms.length === 0
      ? ROOM_DIRECTORY.map(() => null)
      : rooms;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1e293b,_#020617_58%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.9fr] lg:p-10">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-cyan-200">
                Live occupancy dashboard
              </div>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Room states update automatically as Python posts new footage
                  readings.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                  Send occupancy events to <span className="text-slate-100">/api/occupancy</span> with a room URL, occupied flag, and timestamp. This page polls the latest state and updates without a manual refresh.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Rooms tracked" value={ROOM_DIRECTORY.length.toString()} />
                <StatCard label="Occupied" value={summary.occupiedCount.toString()} />
                <StatCard label="Probably Empty" value={summary.probablyEmptyCount.toString()} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <StatCard label="Free" value={summary.freeCount.toString()} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-inner shadow-black/20">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                    Sync status
                  </p>
                  <p className="mt-1 text-lg font-medium text-white">
                    {error ? "Connection issue" : "Connected"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                    error
                      ? "bg-rose-500/15 text-rose-200"
                      : "bg-emerald-500/15 text-emerald-200"
                  }`}
                >
                  {error ? "Retrying" : "Live"}
                </span>
              </div>

              <div className="mt-4 space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-slate-400">Last sync</p>
                  <p className="mt-1 text-base text-white">
                    {lastSyncedAt ? formatTimestamp(lastSyncedAt) : "Waiting for data"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-slate-400">Polling</p>
                  <p className="mt-1 text-base text-white">
                    Refreshes every {POLL_INTERVAL_MS / 1000} seconds
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-slate-400">Python payload</p>
                  <pre className="mt-2 overflow-x-auto text-xs leading-6 text-cyan-100">{`{
  "room-url": "conference-room-a",
  "occupied": true,
  "timestamp": "2026-05-23T15:30:00Z"
}`}</pre>
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {displayRooms.map((room, index) => {
            if (!room) {
              return (
                <article
                  key={`placeholder-${index}`}
                  className="animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/10"
                >
                  <div className="h-4 w-40 rounded-full bg-white/10" />
                  <div className="mt-4 h-8 w-24 rounded-full bg-white/10" />
                  <div className="mt-6 h-3 w-full rounded-full bg-white/10" />
                  <div className="mt-3 h-3 w-3/4 rounded-full bg-white/10" />
                </article>
              );
            }

            return (
              <article
                key={room.roomUrl}
                className="group rounded-[1.75rem] border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/10 transition-transform duration-200 hover:-translate-y-0.5 hover:border-cyan-400/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-400">
                      {room.roomUrl}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      {room.roomName}
                    </h2>
                  </div>
                  <StatusPill state={room.state} />
                </div>

                <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
                  <div>
                    <p className="text-sm text-slate-400">Current state</p>
                    <p className="mt-1 text-lg font-medium text-white">
                      {formatStateLabel(room.state)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Updated</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {room.timestamp ? formatTimestamp(room.timestamp) : "Not received yet"}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function StatusPill({ state }: { state: RoomStatus["state"] }) {
  const className =
    state === "occupied"
      ? "bg-rose-500/15 text-rose-200"
      : state === "probably_empty"
        ? "bg-amber-500/15 text-amber-100"
        : "bg-emerald-500/15 text-emerald-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${className}`}
    >
      {formatStateLabel(state)}
    </span>
  );
}

function formatStateLabel(state: RoomStatus["state"]) {
  if (state === "occupied") {
    return "Occupied";
  }

  if (state === "probably_empty") {
    return "Probably Empty";
  }

  return "Free";
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
