"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { type PersonRecord } from "@/lib/db";
import { type RoomStatus } from "@/lib/occupancy";

type PeopleResponse = {
  people: PersonRecord[];
};

type OccupancyResponse = {
  rooms: RoomStatus[];
  updatedAt: string;
};

type UserPresenceStatus = "active" | "offline" | "never_seen";

type PeopleGridItem = PersonRecord & {
  status: UserPresenceStatus;
  currentRoom?: string;
  avatarBg: string;
};

// Generates a stable gradient background based on name hash
function getAvatarGradient(name: string): string {
  const gradients = [
    "from-teal-600 to-emerald-500",
    "from-blue-600 to-indigo-500",
    "from-violet-600 to-purple-500",
    "from-rose-600 to-pink-500",
    "from-amber-500 to-orange-600",
    "from-cyan-600 to-blue-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

export default function PeopleRegistry() {
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [activeRooms, setActiveRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI Filters and Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "offline" | "never_seen">("all");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "seen-new" | "seen-old">("seen-new");
  
  // Modal State
  const [selectedPerson, setSelectedPerson] = useState<PeopleGridItem | null>(null);

  // Data Fetching
  const fetchData = async () => {
    try {
      const [peopleRes, occupancyRes] = await Promise.all([
        fetch("/api/people", { cache: "no-store" }),
        fetch("/api/occupancy", { cache: "no-store" }),
      ]);

      if (!peopleRes.ok || !occupancyRes.ok) {
        throw new Error("Failed to fetch registry data");
      }

      const peopleData = (await peopleRes.json()) as PeopleResponse;
      const occupancyData = (await occupancyRes.json()) as OccupancyResponse;

      setPeople(peopleData.people || []);
      setActiveRooms(occupancyData.rooms || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll data every 4 seconds to catch telemetry changes
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Map of currently active people and their rooms
  const activePeopleMap = useMemo(() => {
    const map = new Map<string, string>(); // Name -> RoomName
    activeRooms.forEach((room) => {
      if (room.state === "occupied" && room.people) {
        room.people.forEach((personName) => {
          map.set(personName, room.roomName);
        });
      }
    });
    return map;
  }, [activeRooms]);

  // Merge and compute current status for each person
  const gridItems = useMemo<PeopleGridItem[]>(() => {
    return people.map((p) => {
      const currentRoom = activePeopleMap.get(p.name);
      const isActiveNow = !!currentRoom;
      
      let status: UserPresenceStatus = "never_seen";
      if (isActiveNow) {
        status = "active";
      } else if (p.lastSeenTimestamp) {
        status = "offline";
      }

      return {
        ...p,
        status,
        currentRoom,
        avatarBg: getAvatarGradient(p.name),
      };
    });
  }, [people, activePeopleMap]);

  // Filter and Sort grid items
  const processedItems = useMemo(() => {
    let result = [...gridItems];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.lastSeenLocation.toLowerCase().includes(query) ||
          (item.currentRoom && item.currentRoom.toLowerCase().includes(query)),
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "seen-new":
          const dateA = a.lastSeenTimestamp ? new Date(a.lastSeenTimestamp).getTime() : 0;
          const dateB = b.lastSeenTimestamp ? new Date(b.lastSeenTimestamp).getTime() : 0;
          // Put active people at the very top, then newest seen
          if (a.status === "active" && b.status !== "active") return -1;
          if (b.status === "active" && a.status !== "active") return 1;
          return dateB - dateA;
        case "seen-old":
          const dateAOld = a.lastSeenTimestamp ? new Date(a.lastSeenTimestamp).getTime() : Infinity;
          const dateBOld = b.lastSeenTimestamp ? new Date(b.lastSeenTimestamp).getTime() : Infinity;
          return dateAOld - dateBOld;
        default:
          return 0;
      }
    });

    return result;
  }, [gridItems, searchQuery, statusFilter, sortBy]);

  // Helper formatting functions
  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return "Never seen";
    const date = new Date(isoString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 5) return "Just now";
    
    const interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval === 1 ? "1 year ago" : `${interval} years ago`;
    
    const months = Math.floor(seconds / 2592000);
    if (months >= 1) return months === 1 ? "1 month ago" : `${months} months ago`;
    
    const days = Math.floor(seconds / 86400);
    if (days >= 1) return days === 1 ? "Yesterday" : `${days} days ago`;
    
    const hours = Math.floor(seconds / 3600);
    if (hours >= 1) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 1) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
    
    return `${seconds} seconds ago`;
  };

  const formatAbsoluteTime = (isoString: string | null) => {
    if (!isoString) return "Awaiting telemetry";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(isoString));
  };

  return (
    <main className="min-h-screen bg-slate-50/45 pb-12 font-sans text-slate-900">
      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Header Block */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-rose-600 border border-rose-100">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                Live Personnel Tracker
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                People Registry & Location Database
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Monitor presence logs of registered users. View active locations parsed from live YOLO feeds, reference sample count stats, and historical last-seen timestamps.
              </p>
            </div>
            
            {/* Quick Stats Summary */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-250/60 bg-slate-50 px-4 py-3 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Registered</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">{people.length}</p>
              </div>
              <div className="rounded-2xl border border-brand/20 bg-brand-light px-4 py-3 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Active Now</p>
                <p className="mt-1 text-2xl font-extrabold text-brand">{activePeopleMap.size}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Filters and Controls */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by name or room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.015)]"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Users" },
              { id: "active", label: "Active Now" },
              { id: "offline", label: "Offline" },
              { id: "never_seen", label: "Never Seen" },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setStatusFilter(filter.id as typeof statusFilter)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  statusFilter === filter.id
                    ? "bg-brand text-white shadow-sm"
                    : "bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Sorting Dropdown */}
          <div className="relative flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl border border-slate-250/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-brand cursor-pointer"
            >
              <option value="seen-new">Last Seen (Newest)</option>
              <option value="seen-old">Last Seen (Oldest)</option>
              <option value="name-asc">Name (A - Z)</option>
              <option value="name-desc">Name (Z - A)</option>
            </select>
          </div>
        </section>

        {/* Registry Presentation */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand" />
            <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-wider animate-pulse">Syncing registry telemetry...</p>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 text-center shadow-sm">
            <p className="text-sm font-bold text-rose-700">Telemetry error: {error}</p>
            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              Retry Connection
            </button>
          </div>
        ) : processedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-slate-250/60 rounded-3xl text-center">
            <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="mt-3 text-sm font-bold text-slate-500 uppercase tracking-wider">No matching profiles found</p>
            <p className="mt-1 max-w-[280px] text-xs text-slate-400 leading-normal">
              Adjust search parameters or status filters. Registered individuals will populate once folders exist inside core/faces.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4">User Profile</th>
                    <th className="px-6 py-4">Current Presence</th>
                    <th className="px-6 py-4">Last Seen Location</th>
                    <th className="px-6 py-4">Gallery Registry</th>
                    <th className="px-6 py-4">Telemetry Timestamp</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processedItems.map((person) => (
                    <tr
                      key={person.name}
                      onClick={() => setSelectedPerson(person)}
                      className="group cursor-pointer hover:bg-slate-50/50 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${person.avatarBg} text-white font-extrabold text-sm shadow-sm group-hover:scale-105 transition-transform`}>
                            {person.name.split(" ").map((n) => n.charAt(0)).join("").substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-brand transition-colors">{person.name}</p>
                            <p className="text-[10px] font-medium text-slate-400">Registered profile</p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          person.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                            : person.status === "offline"
                              ? "bg-slate-50 text-slate-600 border border-slate-200"
                              : "bg-amber-50 text-amber-700 border border-amber-250/40"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            person.status === "active"
                              ? "bg-emerald-500 animate-pulse"
                              : person.status === "offline"
                                ? "bg-slate-400"
                                : "bg-amber-500 animate-pulse"
                          }`} />
                          {person.status === "active" ? "Active Now" : person.status === "offline" ? "Offline" : "Never Seen"}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-700">
                        {person.status === "active" ? (
                          <span className="flex items-center gap-1.5 text-brand">
                            <span className="h-2 w-2 rounded-full bg-brand animate-ping" />
                            {person.currentRoom} Room
                          </span>
                        ) : person.status === "offline" ? (
                          <span>{person.lastSeenLocation} Room</span>
                        ) : (
                          <span className="text-slate-450 italic">None</span>
                        )}
                      </td>

                      {/* Face Registry Size */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/60 px-2 py-1 text-[11px] font-bold text-slate-650">
                          {person.imageCount || 0} reference images
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-semibold">
                        {person.status === "never_seen" ? (
                          <span className="text-slate-400 italic">No telemetry</span>
                        ) : (
                          <div>
                            <p className="text-slate-800">{formatTimeAgo(person.lastSeenTimestamp)}</p>
                            <p className="text-[9px] text-slate-400 font-medium">{formatAbsoluteTime(person.lastSeenTimestamp)}</p>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <button className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 shadow-sm opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="grid gap-4 md:hidden">
              {processedItems.map((person) => (
                <div
                  key={person.name}
                  onClick={() => setSelectedPerson(person)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:scale-[0.99] transition-transform flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${person.avatarBg} text-white font-extrabold text-sm shadow-sm`}>
                      {person.name.split(" ").map((n) => n.charAt(0)).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{person.name}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        {person.status === "active" ? (
                          <span className="text-brand">Active: {person.currentRoom}</span>
                        ) : person.status === "offline" ? (
                          <span>Last seen: {person.lastSeenLocation}</span>
                        ) : (
                          <span className="text-slate-400 italic">Never seen</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${
                      person.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-250/50"
                        : person.status === "offline"
                          ? "bg-slate-50 text-slate-650 border border-slate-200"
                          : "bg-amber-50 text-amber-700 border border-amber-250/20"
                    }`}>
                      {person.status === "active" ? "Active" : person.status === "offline" ? "Offline" : "Never"}
                    </span>
                    {person.status !== "never_seen" && (
                      <span className="text-[10px] font-semibold text-slate-450">{formatTimeAgo(person.lastSeenTimestamp)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Profile Details Modal */}
      {selectedPerson && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4 transition-all duration-300"
          onClick={() => setSelectedPerson(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-all duration-200 sm:p-8 transform scale-100 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${selectedPerson.avatarBg} text-white font-extrabold text-base shadow-md`}>
                  {selectedPerson.name.split(" ").map((n) => n.charAt(0)).join("").substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedPerson.name}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Identified User Profile</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-650 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="mt-6 space-y-6">
              {/* Telemetry presence details */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Telemetry Status</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedPerson.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-250/50"
                      : selectedPerson.status === "offline"
                        ? "bg-slate-50 text-slate-600 border border-slate-200"
                        : "bg-amber-50 text-amber-700 border border-amber-250/30"
                  }`}>
                    <span className={`h-1 w-1 rounded-full ${
                      selectedPerson.status === "active"
                        ? "bg-emerald-500 animate-pulse"
                        : selectedPerson.status === "offline"
                          ? "bg-slate-450"
                          : "bg-amber-500 animate-pulse"
                    }`} />
                    {selectedPerson.status === "active" ? "Active Now" : selectedPerson.status === "offline" ? "Offline" : "Never Seen"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Current / Last Location</p>
                    <p className="mt-1 text-slate-700">
                      {selectedPerson.status === "active" ? (
                        <span className="text-brand font-bold">{selectedPerson.currentRoom} Room</span>
                      ) : selectedPerson.status === "offline" ? (
                        <span>{selectedPerson.lastSeenLocation} Room</span>
                      ) : (
                        <span className="italic text-slate-400">Never seen</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Last Telemetry Scan</p>
                    <p className="mt-1 text-slate-750 font-bold">
                      {selectedPerson.lastSeenTimestamp ? (
                        <span>{formatTimeAgo(selectedPerson.lastSeenTimestamp)}</span>
                      ) : (
                        <span className="italic text-slate-400">Awaiting sync</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Edge AI / Face ID diagnostics */}
              <div className="space-y-3.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Edge AI Classifier Diagnostics</h4>
                <div className="border border-slate-200 rounded-2xl p-4 divide-y divide-slate-100 text-xs">
                  <div className="flex items-center justify-between py-2.5 first:pt-0">
                    <span className="text-slate-500 font-semibold">Gallery Reference Samples</span>
                    <span className="font-bold text-slate-800">{selectedPerson.imageCount || 0} images</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-slate-500 font-semibold">LBPH Face ID Label</span>
                    <span className="font-mono text-slate-700 bg-slate-50 border border-slate-200/60 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                      {selectedPerson.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 last:pb-0">
                    <span className="text-slate-500 font-semibold">Recognition Class State</span>
                    <span className={`font-bold ${selectedPerson.imageCount && selectedPerson.imageCount > 0 ? "text-brand" : "text-amber-600"}`}>
                      {selectedPerson.imageCount && selectedPerson.imageCount > 0 ? "Trained & Validated" : "Awaiting Face Gallery"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Absolute timestamp details */}
              {selectedPerson.lastSeenTimestamp && (
                <div className="rounded-2xl bg-brand-light/30 border border-brand/5 p-4 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Telemetry Date Anchor</p>
                  <p className="mt-1 font-mono text-[10px] font-bold text-brand">
                    {formatAbsoluteTime(selectedPerson.lastSeenTimestamp)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
