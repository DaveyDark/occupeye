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

  const statusByRoomName = useMemo(
    () => new Map(rooms.map((room) => [room.roomName, room] as const)),
    [rooms],
  );

  const roomViews = useMemo(
    () =>
      ROOM_DIRECTORY.map((definition) => {
        const status = statusByRoomName.get(definition.roomName);

        return {
          definition,
          status: status ?? createFallbackStatus(definition),
        };
      }),
    [statusByRoomName],
  );

  const summary = useMemo(() => {
    const occupiedCount = roomViews.filter((room) => room.status.state === "occupied").length;
    const probablyEmptyCount = roomViews.filter((room) => room.status.state === "probably_empty").length;
    const freeCount = roomViews.filter((room) => room.status.state === "free").length;
    const notConfiguredCount = roomViews.filter((room) => room.status.state === "not_configured").length;

    return {
      occupiedCount,
      probablyEmptyCount,
      freeCount,
      notConfiguredCount,
      configuredCount: roomViews.length - notConfiguredCount,
    };
  }, [roomViews]);

  const connectionLabel = error ? "Connection issue" : isLoading ? "Loading" : "Connected";
  const connectionTone = error
    ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
    : isLoading
      ? "border-slate-400/20 bg-slate-400/10 text-slate-200"
      : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.18),_transparent_30%),radial-gradient(circle_at_20%_80%,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,_#08111f_0%,_#050816_55%,_#020617_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] opacity-20" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                Live floor plan
              </div>

              <div className="space-y-3">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Clean occupancy map for the office floor plan.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                  Only Gamma is mapped to the active RTSP source. The other rooms stay on the plan and are marked not configured until a stream is assigned.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Rooms" value={ROOM_DIRECTORY.length.toString()} />
                <StatCard label="Configured" value={summary.configuredCount.toString()} />
                <StatCard label="Occupied" value={summary.occupiedCount.toString()} />
                <StatCard label="Probably free" value={summary.probablyEmptyCount.toString()} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Free" value={summary.freeCount.toString()} />
                <StatCard label="Not configured" value={summary.notConfiguredCount.toString()} />
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-inner shadow-black/20">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Sync status</p>
                  <p className="mt-1 text-lg font-medium text-white">{connectionLabel}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${connectionTone}`}>
                  {error ? "Retrying" : isLoading ? "Waiting" : "Live"}
                </span>
              </div>

              <div className="grid gap-3 text-sm text-slate-300">
                <InfoCard label="Last sync" value={lastSyncedAt ? formatTimestamp(lastSyncedAt) : "Waiting for data"} />
                <InfoCard label="Polling" value={`Refreshes every ${POLL_INTERVAL_MS / 1000} seconds`} />
                <InfoCard label="Mapped room" value="Gamma" subtle="Only room with an RTSP source" highlight />
              </div>

              {error ? (
                <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.45fr)]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20 sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Floor plan</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Room layout</h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                Live states
              </div>
            </div>

            <div className="relative mt-5 aspect-[1000/760] overflow-hidden rounded-[1.85rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_38%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] p-4">
              <div className="pointer-events-none absolute inset-4 rounded-[1.5rem]  border-white/75" />
              <div className="pointer-events-none  absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:64px_64px]" />

              {roomViews.map((room) => (
                <RoomTile key={room.definition.roomName} room={room} />
              ))}

              <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <LegendChip colorClass="bg-rose-400" label="Occupied" />
                <LegendChip colorClass="bg-amber-300" label="Probably free" />
                <LegendChip colorClass="bg-emerald-400" label="Free" />
                <LegendChip colorClass="bg-slate-400" label="Not configured" />
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-xl shadow-black/15">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Legend</p>
              <div className="mt-4 space-y-3">
                <LegendRow colorClass="bg-rose-400" label="Occupied" description="Room is actively occupied." />
                <LegendRow colorClass="bg-amber-300" label="Probably free" description="Recent transition, likely cleared." />
                <LegendRow colorClass="bg-emerald-400" label="Free" description="Room has settled back to free." />
                <LegendRow colorClass="bg-slate-400" label="Not configured" description="No RTSP source mapped yet." />
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/10">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Rooms</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {roomViews.map((room) => (
                  <RoomNamePill key={room.definition.roomName} room={room} />
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-cyan-400/15 bg-cyan-400/10 p-5 shadow-xl shadow-black/10">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/75">Mapped feed</p>
              <p className="mt-2 text-xl font-semibold text-white">Gamma</p>
              <p className="mt-2 text-sm leading-6 text-cyan-50/90">
                This is the only room wired to the live RTSP stream. Everything else stays visible but shows as not configured until a source is assigned.
              </p>
            </section>
          </aside>
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

function InfoCard({
  label,
  value,
  subtle,
  highlight,
}: {
  label: string;
  value: string;
  subtle?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-cyan-400/20 bg-cyan-400/10" : "border-white/10 bg-white/5"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-medium ${highlight ? "text-white" : "text-slate-100"}`}>{value}</p>
      {subtle ? <p className="mt-1 text-sm text-slate-300">{subtle}</p> : null}
    </div>
  );
}

function createFallbackStatus(room: (typeof ROOM_DIRECTORY)[number]): RoomStatus {
  return {
    ...room,
    state: room.roomUrl ? "free" : "not_configured",
    timestamp: null,
  };
}

function RoomTile({
  room,
}: {
  room: {
    definition: (typeof ROOM_DIRECTORY)[number];
    status: RoomStatus;
  };
}) {
  const { definition, status } = room;
  const style = {
    left: definition.layout.left,
    top: definition.layout.top,
    width: definition.layout.width,
    height: definition.layout.height,
  };

  const tileClassName = getRoomTileClasses(status.state);

  return (
    <div className="absolute" style={style}>
      <article
        aria-label={`${definition.roomName}, ${formatStateLabel(status.state)}`}
        title={`${definition.roomName} - ${formatStateLabel(status.state)}`}
        className={`group flex h-full items-center justify-center rounded-[1.4rem] border-4 px-3 py-2 text-center shadow-lg shadow-black/25 transition-transform duration-200 hover:-translate-y-0.5 ${tileClassName}`}
      >
        <span className="select-none text-[0.82rem] font-semibold tracking-[0.16em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:text-sm">
          {definition.roomName}
        </span>
      </article>
    </div>
  );
}

function RoomNamePill({
  room,
}: {
  room: {
    definition: (typeof ROOM_DIRECTORY)[number];
    status: RoomStatus;
  };
}) {
  const colorClass = getRoomStateDotClass(room.status.state);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
      <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
      <span>{room.definition.roomName}</span>
    </div>
  );
}

function LegendChip({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/75 px-3 py-1.5 text-xs font-medium text-slate-200">
      <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
      {label}
    </div>
  );
}

function LegendRow({
  colorClass,
  label,
  description,
}: {
  colorClass: string;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className={`mt-0.5 h-3 w-3 rounded-full ${colorClass}`} />
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
      </div>
    </div>
  );
}

function getRoomTileClasses(state: RoomStatus["state"]) {
  if (state === "occupied") {
    return "border-rose-300/90 bg-gradient-to-br from-rose-500/90 to-rose-700/80 text-white";
  }

  if (state === "probably_empty") {
    return "border-amber-200/90 bg-gradient-to-br from-amber-400/85 to-amber-600/75 text-white";
  }

  if (state === "not_configured") {
    return "border-slate-500/80 border-dashed bg-slate-900/85 text-slate-100";
  }

  return "border-emerald-300/90 bg-gradient-to-br from-emerald-500/85 to-emerald-700/75 text-white";
}

function getRoomStateDotClass(state: RoomStatus["state"]) {
  if (state === "occupied") {
    return "bg-rose-400";
  }

  if (state === "probably_empty") {
    return "bg-amber-300";
  }

  if (state === "not_configured") {
    return "bg-slate-400";
  }

  return "bg-emerald-400";
}

function formatStateLabel(state: RoomStatus["state"]) {
  if (state === "occupied") {
    return "Occupied";
  }

  if (state === "probably_empty") {
    return "Probably free";
  }

  if (state === "not_configured") {
    return "Not configured";
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
