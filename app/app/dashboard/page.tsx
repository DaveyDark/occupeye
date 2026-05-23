"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { ROOM_DIRECTORY, type RoomStatus } from "@/lib/occupancy";

type OccupancyResponse = {
  rooms: RoomStatus[];
  updatedAt: string;
};

const POLL_INTERVAL_MS = 2000;

export default function Dashboard() {
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomStatus | null>(null);
  const [bookedByName, setBookedByName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

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

  const activeSelectedRoom = useMemo(() => {
    if (!selectedRoom) return null;
    const status = statusByRoomName.get(selectedRoom.roomName);
    return status ?? selectedRoom;
  }, [selectedRoom, statusByRoomName]);

  // Clear booking input and error on room change
  useEffect(() => {
    setBookedByName("");
    setBookingError(null);
  }, [selectedRoom]);

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSelectedRoom || !bookedByName.trim()) return;

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName: activeSelectedRoom.roomName,
          bookedBy: bookedByName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Reservation failed");
      }

      setBookedByName("");
      
      const roomsRes = await fetch("/api/occupancy", { cache: "no-store" });
      if (roomsRes.ok) {
        const data = await roomsRes.json();
        setRooms(data.rooms);
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Error reserving room");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!activeSelectedRoom) return;

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName: activeSelectedRoom.roomName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Cancellation failed");
      }

      const roomsRes = await fetch("/api/occupancy", { cache: "no-store" });
      if (roomsRes.ok) {
        const data = await roomsRes.json();
        setRooms(data.rooms);
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Error canceling reservation");
    } finally {
      setIsSubmitting(false);
    }
  };

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
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : isLoading
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <main className="min-h-screen bg-slate-50/45 pb-12 font-sans text-slate-900">
      <Navbar />

      <div className="mx-auto mt-6 flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        {/* Header Hero Section */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-brand">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand"></span>
                  </span>
                  Live Floor Occupancy
                </div>
                <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${connectionTone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    error ? "bg-rose-500 animate-pulse" : isLoading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                  }`} />
                  <span>{error ? "Sync Error" : isLoading ? "Connecting" : "Telemetry Active"}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  Enterprise Workspace Management Map
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                  Real-time space occupancy visualization and active telemetry routing. Click on any room node on the floor plan map to view the live detector stream, identified occupants, and hardware configuration details.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Rooms" value={ROOM_DIRECTORY.length.toString()} />
                <StatCard label="Configured" value={summary.configuredCount.toString()} badgeColor="bg-brand" />
                <StatCard label="Occupied" value={summary.occupiedCount.toString()} badgeColor="bg-rose-500" />
                <StatCard label="Probably Free" value={summary.probablyEmptyCount.toString()} badgeColor="bg-amber-500" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Free / Unoccupied" value={summary.freeCount.toString()} badgeColor="bg-emerald-500" />
                <StatCard label="Not Configured" value={summary.notConfiguredCount.toString()} badgeColor="bg-slate-400" />
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-6">
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-200/60 pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sync Status</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{connectionLabel}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${connectionTone}`}>
                    {error ? "Retrying" : isLoading ? "Waiting" : "Active"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <InfoCard label="Last Telemetry Sync" value={lastSyncedAt ? formatTimestamp(lastSyncedAt) : "Awaiting sync"} />
                  <InfoCard label="Query Configuration" value={`Telemetry polled every ${POLL_INTERVAL_MS / 1000} seconds`} />
                  <InfoCard 
                    label="Active Feeds Status" 
                    value={`${roomViews.filter(r => r.definition.roomUrl).length} Connected`} 
                    subtle={`${roomViews.filter(r => !r.definition.roomUrl).length} dormant endpoints`} 
                    highlight 
                  />
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Floor Plan and Details */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.45fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Workspace Layout</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Office Floor Plan</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                Live Telemetry
              </div>
            </div>

            {/* Architectural Layout Container */}
            <div className="relative mt-6 aspect-[1000/760] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
              {/* Subtle architectural schematic grid lines */}
              <div className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] [background-size:32px_32px]" />

              {roomViews.map((room) => (
                <RoomTile 
                  key={room.definition.roomName} 
                  room={room} 
                  onSelect={() => setSelectedRoom(room.status)}
                />
              ))}

              <div className="absolute bottom-4 left-4 right-4 grid gap-2 grid-cols-2 sm:grid-cols-5">
                <LegendChip colorClass="bg-rose-500" label="Occupied" />
                <LegendChip colorClass="bg-amber-500" label="Probably Free" />
                <LegendChip colorClass="bg-emerald-500" label="Free / Vacant" />
                <LegendChip colorClass="bg-slate-300" label="Offline" />
                <LegendChip colorClass="bg-slate-400" label="Unconfigured" />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">People In Rooms</p>
              <div className="mt-4 space-y-3">
                {roomViews.filter(r => r.status.state === "occupied").length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No occupants detected.</p>
                ) : (
                  roomViews
                    .filter(r => r.status.state === "occupied")
                    .map(r => {
                      const peopleList = r.status.people ?? [];
                      const totalCount = r.status.personCount ?? 0;
                      const identifiedCount = peopleList.length;
                      const unidentifiedCount = Math.max(0, totalCount - identifiedCount);
                      
                      return (
                        <div key={r.definition.roomName} className="flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-slate-50/50 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">{r.definition.roomName}</span>
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold uppercase text-rose-600">
                              Occupied
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {identifiedCount > 0 ? (
                              <>
                                {peopleList.map(person => (
                                  <span key={person} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                                    <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
                                    {person}
                                  </span>
                                ))}
                                {unidentifiedCount > 0 && (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                                    +{unidentifiedCount} unidentified
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                                <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
                                {totalCount} {totalCount === 1 ? "person" : "people"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Legend & Diagnostics</p>
              <div className="mt-4 space-y-3">
                <LegendRow colorClass="bg-rose-500" label="Occupied" description="Room is occupied by one or more individuals." />
                <LegendRow colorClass="bg-amber-500" label="Probably Free" description="Motion ceased recently. Verifying clear state." />
                <LegendRow colorClass="bg-emerald-500" label="Free / Vacant" description="No occupancy detected. Space is available." />
                <LegendRow colorClass="bg-slate-300" label="Offline / Unknown" description="Stream source mapped but telemetry feed offline." />
                <LegendRow colorClass="bg-slate-400" label="Not Configured" description="No RTSP endpoint mapped to this space." />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Registered Spaces</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {roomViews.map((room) => (
                  <RoomNamePill key={room.definition.roomName} room={room} />
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-brand/20 bg-brand/5 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-brand/85">Active Streams Directory</p>
              <div className="mt-3 space-y-3">
                {roomViews.filter(r => r.definition.roomUrl).length === 0 ? (
                  <p className="text-xs text-brand/70 italic">No stream sources registered in system configuration.</p>
                ) : (
                  roomViews.filter(r => r.definition.roomUrl).map(r => (
                    <div key={r.definition.roomName} className="space-y-1.5">
                      <p className="text-xs font-bold text-brand uppercase tracking-wider">{r.definition.roomName} Room</p>
                      <p className="font-mono text-[10px] text-slate-700 bg-white/70 border border-brand/10 rounded-lg p-2 break-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                        {r.definition.roomUrl}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>

      {activeSelectedRoom && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 transition-all duration-300"
          onClick={() => setSelectedRoom(null)}
        >
          <div 
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-all duration-200 sm:p-8 transform scale-100 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-slate-900">{activeSelectedRoom.roomName} Room</h3>
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    activeSelectedRoom.state === "occupied"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : activeSelectedRoom.isBooked
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : activeSelectedRoom.state === "probably_empty"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : activeSelectedRoom.state === "free"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-50 text-slate-500 border border-slate-200"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      activeSelectedRoom.state === "occupied"
                        ? "bg-rose-500 animate-pulse"
                        : activeSelectedRoom.isBooked
                          ? "bg-indigo-500"
                          : activeSelectedRoom.state === "probably_empty"
                            ? "bg-amber-500 animate-pulse"
                            : activeSelectedRoom.state === "free"
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                    }`} />
                    <span>{formatStateLabel(activeSelectedRoom)}</span>
                  </div>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-500 break-all">
                  {activeSelectedRoom.roomUrl || "No active telemetry source mapped"}
                </p>
              </div>
              <button
                onClick={() => setSelectedRoom(null)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="mt-6 space-y-6">
              {/* Active Booking Info */}
              {activeSelectedRoom.isBooked && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3 shadow-[0_2px_8px_-4px_rgba(79,70,229,0.1)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500">Reserved Space</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">
                        Booked by <span className="text-indigo-700">{activeSelectedRoom.bookedBy}</span>
                      </p>
                      {activeSelectedRoom.bookedAt && (
                        <p className="text-[10px] text-slate-550 mt-0.5">
                          Reserved at {formatTimestamp(activeSelectedRoom.bookedAt)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleCancelReservation}
                      disabled={isSubmitting}
                      className="rounded-xl border border-rose-200 bg-white hover:bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? "Releasing..." : "Release Room"}
                    </button>
                  </div>
                  {activeSelectedRoom.state !== "occupied" && activeSelectedRoom.roomUrl && (
                    <p className="text-[10px] leading-relaxed text-indigo-600 bg-white/70 rounded-xl p-3 border border-indigo-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]">
                      ℹ️ Presence sensing is active. If occupancy is not detected, this reservation will automatically reset to free.
                    </p>
                  )}
                </div>
              )}

              {/* Booking Form (only when vacant and not booked) */}
              {!activeSelectedRoom.isBooked && activeSelectedRoom.state !== "occupied" && (
                <form onSubmit={handleReserve} className="rounded-2xl border border-slate-200 bg-slate-50/30 p-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                      Reserve this Room
                    </label>
                    <p className="text-[11px] text-slate-500 leading-normal mb-3">
                      This space is currently vacant. Enter your name below to lock the room reservation.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={bookedByName}
                        onChange={(e) => setBookedByName(e.target.value)}
                        placeholder="Your Name (e.g. Alice)"
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-brand focus:outline-none shadow-sm focus:ring-1 focus:ring-brand"
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting || !bookedByName.trim()}
                        className="rounded-xl bg-brand hover:bg-brand-hover text-white px-4 py-2 text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? "Reserving..." : "Reserve"}
                      </button>
                    </div>
                  </div>
                  {bookingError && (
                    <p className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">
                      ⚠️ {bookingError}
                    </p>
                  )}
                </form>
              )}

              {/* Occupants list */}
              {activeSelectedRoom.state === "occupied" && (
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Current Occupants</span>
                  <div className="flex flex-wrap gap-2">
                    {activeSelectedRoom.people && activeSelectedRoom.people.length > 0 ? (
                      activeSelectedRoom.people.map(person => (
                        <span key={person} className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand uppercase">
                            {person.charAt(0)}
                          </div>
                          {person}
                        </span>
                      ))
                    ) : null}
                    
                    {/* Unidentified occupants badges */}
                    {(() => {
                      const totalCount = activeSelectedRoom.personCount ?? 0;
                      const identifiedCount = activeSelectedRoom.people?.length ?? 0;
                      const unidentifiedCount = Math.max(0, totalCount - identifiedCount);
                      
                      if (unidentifiedCount > 0) {
                        return Array.from({ length: unidentifiedCount }).map((_, idx) => (
                           <span key={`unidentified-${idx}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-200/80 px-3 py-2 text-sm font-semibold text-slate-550 shadow-sm">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
                              ?
                            </div>
                            Unidentified Occupant
                          </span>
                        ));
                      }
                      
                      if (identifiedCount === 0 && totalCount === 0) {
                        return <span className="text-xs text-slate-500 italic block">Unidentified occupancy (unregistered signature).</span>;
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {/* Vacant placeholder inside modal */}
              {activeSelectedRoom.state !== "occupied" && !activeSelectedRoom.isBooked && (
                <div className="flex flex-col items-center justify-center text-center py-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Room is Vacant & Open</p>
                  <p className="mt-1 max-w-[240px] text-[10px] text-slate-400 leading-normal">
                    This space is open for use and has no active reservation. Active monitoring sensors will register occupants dynamically if presence is detected.
                  </p>
                </div>
              )}

              {/* Diagnostics details */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Last Telemetry Sync</p>
                    <p className="mt-1 font-semibold text-slate-700">
                      {activeSelectedRoom.timestamp ? formatTimestamp(activeSelectedRoom.timestamp) : "Awaiting first payload"}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Sensor Mode</p>
                    <p className="mt-1 font-semibold text-slate-700">
                      {activeSelectedRoom.roomUrl ? "Live telemetry active" : "Sensor dormant"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ 
  label, 
  value, 
  badgeColor 
}: { 
  label: string; 
  value: string; 
  badgeColor?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {badgeColor ? <span className={`h-2.5 w-2.5 rounded-full ${badgeColor}`} /> : null}
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
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
      className={`rounded-xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.01)] ${
        highlight 
          ? "border-brand/25 bg-brand-light/40" 
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-bold ${highlight ? "text-brand" : "text-slate-800"}`}>{value}</p>
      {subtle ? <p className="mt-1 text-[11px] font-medium text-slate-500 leading-normal">{subtle}</p> : null}
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
  onSelect,
}: {
  room: {
    definition: (typeof ROOM_DIRECTORY)[number];
    status: RoomStatus;
  };
  onSelect: () => void;
}) {
  const { definition, status } = room;
  const style = {
    left: definition.layout.left,
    top: definition.layout.top,
    width: definition.layout.width,
    height: definition.layout.height,
  };

  const tileClassName = getRoomTileClasses(status);
  const dotColor = getRoomStateDotClass(status);
  const textColor = getRoomStateTextClass(status);

  return (
    <div className="absolute cursor-pointer" style={style} onClick={onSelect}>
      <article
        aria-label={`${definition.roomName}, ${formatStateLabel(status)}`}
        title={`${definition.roomName} - ${formatStateLabel(status)}`}
        className={`group flex h-full flex-col items-center justify-center rounded-xl border px-3 py-2 text-center shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${tileClassName}`}
      >
        <span className="select-none text-xs font-extrabold uppercase tracking-wider text-slate-800 sm:text-sm flex items-center gap-1 justify-center">
          {definition.roomName}
          {status.isBooked && (
            <svg className="h-3 w-3 text-indigo-650 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className={`select-none text-[9px] font-bold uppercase tracking-wider ${textColor}`}>
            {formatStateLabel(status)}
          </span>
        </div>
        {status.state === "occupied" && (
          <div className="mt-2 flex flex-wrap justify-center gap-1 max-w-full overflow-hidden">
            {(() => {
              const peopleList = status.people ?? [];
              const totalCount = status.personCount ?? 0;
              const identifiedCount = peopleList.length;
              const unidentifiedCount = Math.max(0, totalCount - identifiedCount);
              
              if (identifiedCount > 0) {
                return (
                  <>
                    {peopleList.map((person) => (
                      <span
                        key={person}
                        className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 tracking-tight whitespace-nowrap shadow-sm"
                      >
                        {person}
                      </span>
                    ))}
                    {unidentifiedCount > 0 && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 tracking-tight whitespace-nowrap shadow-sm">
                        +{unidentifiedCount}
                      </span>
                    )}
                  </>
                );
              } else if (totalCount > 0) {
                return (
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 tracking-tight whitespace-nowrap shadow-sm">
                    {totalCount} {totalCount === 1 ? "person" : "people"}
                  </span>
                );
              }
              return null;
            })()}
          </div>
        )}
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
  const colorClass = getRoomStateDotClass(room.status);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      <span>{room.definition.roomName}</span>
    </div>
  );
}

function LegendChip({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      <span>{label}</span>
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
    <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
      <span className={`mt-1.5 h-2 w-2 rounded-full ${colorClass}`} />
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-800">{label}</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function getRoomTileClasses(status: RoomStatus) {
  const { state, isBooked } = status;
  if (state === "unknown") {
    return "border-slate-200 border-dashed bg-slate-50/50 hover:bg-slate-50 text-slate-400";
  }

  if (state === "occupied") {
    return "border-rose-300 bg-rose-50/60 hover:bg-rose-50";
  }

  if (isBooked) {
    return "border-indigo-300 bg-indigo-50/65 hover:bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-100";
  }

  if (state === "probably_empty") {
    return "border-amber-300 bg-amber-50/60 hover:bg-amber-50";
  }

  if (state === "not_configured") {
    return "border-slate-200 border-dashed bg-slate-50/30 text-slate-400 opacity-60";
  }

  return "border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50";
}

function getRoomStateDotClass(status: RoomStatus) {
  const { state, isBooked } = status;
  if (state === "unknown") {
    return "bg-slate-400/70";
  }

  if (state === "occupied") {
    return "bg-rose-500";
  }

  if (isBooked) {
    return "bg-indigo-500";
  }

  if (state === "probably_empty") {
    return "bg-amber-550";
  }

  if (state === "not_configured") {
    return "bg-slate-400";
  }

  return "bg-emerald-500";
}

function getRoomStateTextClass(status: RoomStatus) {
  const { state, isBooked } = status;
  if (state === "unknown") {
    return "text-slate-400";
  }

  if (state === "occupied") {
    return "text-rose-700";
  }

  if (isBooked) {
    return "text-indigo-700";
  }

  if (state === "probably_empty") {
    return "text-amber-700";
  }

  if (state === "not_configured") {
    return "text-slate-400";
  }

  return "text-emerald-700";
}

function formatStateLabel(status: RoomStatus) {
  const { state, isBooked } = status;
  if (state === "unknown") {
    return "Offline / Unknown";
  }

  if (state === "occupied") {
    return "Occupied";
  }

  if (isBooked) {
    return "Reserved";
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
