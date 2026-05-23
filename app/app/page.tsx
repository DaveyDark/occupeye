"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { type RoomStatus } from "@/lib/occupancy";

type OccupancyResponse = {
  rooms: RoomStatus[];
  updatedAt: string;
};

export default function Home() {
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePeopleCount, setActivePeopleCount] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchRooms = async () => {
      try {
        const res = await fetch("/api/occupancy", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as OccupancyResponse;
          if (active) {
            setRooms(data.rooms);
            
            // Calculate total active people right now
            const totalPeople = data.rooms.reduce((acc, room) => {
              if (room.state === "occupied") {
                return acc + (room.personCount ?? 0);
              }
              return acc;
            }, 0);
            setActivePeopleCount(totalPeople);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Error fetching live overview stats:", err);
      }
    };

    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Summary statistics
  const occupiedRooms = rooms.filter((r) => r.state === "occupied");
  const availableRooms = rooms.filter((r) => r.state === "free" || r.state === "probably_empty");
  const offlineRooms = rooms.filter((r) => r.state === "unknown");

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50 pb-16 font-sans text-slate-900">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand/5 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-light px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              Intelligence Layer Ready
            </div>
            
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl max-w-4xl mx-auto leading-none">
              Smarter Workspace Telemetry. <br />
              <span className="text-brand bg-gradient-to-r from-brand to-brand-hover bg-clip-text text-transparent">
                Real-time Presence Analytics.
              </span>
            </h1>
            
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-500 sm:text-lg">
              OccupEye integrates edge AI face identification and YOLOv8 occupancy detection to deliver sub-second tracking of floor occupancy, room usage, and personnel location mapping.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-bold text-white shadow-md hover:bg-brand-hover hover:shadow-lg transition-all duration-200"
              >
                Launch Console Map
                <svg
                  className="h-4 w-4 transform group-hover:translate-x-1 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <Link
                href="/people"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
              >
                View People Registry
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Real-time Telemetry Status Bar */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-slate-100 pb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Telemetry Overview</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Current Workspace State</h2>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>Auto-refreshing every 5s</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
            <OverviewCard
              label="Occupied Rooms"
              value={loading ? "..." : occupiedRooms.length.toString()}
              subText="Active usage"
              colorTone="text-rose-600 bg-rose-50 border-rose-100"
            />
            <OverviewCard
              label="Available Rooms"
              value={loading ? "..." : availableRooms.length.toString()}
              subText="Spaces open"
              colorTone="text-emerald-600 bg-emerald-50 border-emerald-100"
            />
            <OverviewCard
              label="People Detected"
              value={loading ? "..." : activePeopleCount.toString()}
              subText="Present on floor"
              colorTone="text-brand bg-brand-light border-brand/10"
            />
            <OverviewCard
              label="Sensors Offline"
              value={loading ? "..." : offlineRooms.length.toString()}
              subText="Awaiting sync"
              colorTone="text-slate-500 bg-slate-50 border-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Main Feature Cards Grid */}
      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Feature 1: Floor Plan */}
          <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-brand/5 blur-2xl group-hover:bg-brand/10 transition-colors duration-300" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white shadow-md">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="mt-6 text-xl font-bold text-slate-900">Live Floor Occupancy Map</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Interactive 2D architectural representation of the workspace. Highlights rooms in real-time, displays people names, counts, and streams live telemetry status directly from YOLO detectors.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:text-brand-hover"
              >
                Open Live Map
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Feature 2: People Tracker */}
          <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-rose-500/5 blur-2xl group-hover:bg-rose-500/10 transition-colors duration-300" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="mt-6 text-xl font-bold text-slate-900">People Registry & Locator</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Audit logs of all individuals configured in the facial recognition database. View their current active locations, historical last seen room nodes, and exact relative timestamps.
            </p>
            <div className="mt-6">
              <Link
                href="/people"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 hover:text-rose-700"
              >
                Access Registry Log
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Specifications */}
      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">System Architecture Specs</h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800">YOLOv8 Object Detection</h4>
              <p className="text-xs leading-relaxed text-slate-500">
                Lightweight computer vision model deployed locally at the edge. Identifies and counts human silhouettes in real-time, operating under a global inference lock to optimize CPU resource allocation.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800">LBPH Face Recognition</h4>
              <p className="text-xs leading-relaxed text-slate-500">
                Local Binary Patterns Histograms (LBPH) classifier trained on reference images from local directories. Seamlessly flags identities when clear face textures are detected inside human bounding boxes.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800">Temporal Smoothing Filters</h4>
              <p className="text-xs leading-relaxed text-slate-500">
                Hysteresis algorithm in state machines filters camera frame flickering and temporary occlusion. Confirms presence state shifts only after stable consecutive frame samples.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function OverviewCard({
  label,
  value,
  subText,
  colorTone,
}: {
  label: string;
  value: string;
  subText: string;
  colorTone: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition-transform duration-200 hover:scale-[1.01] ${colorTone}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-semibold opacity-60 leading-none">{subText}</p>
    </div>
  );
}
