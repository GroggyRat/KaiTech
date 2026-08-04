"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { Play, Square, MapPin, AlertTriangle, Navigation, Clock } from "lucide-react";
import { formatDuration, formatDateTime, parseGeoPoint } from "@/lib/utils";
import type { Shift, WorkSite, GeofenceViolation } from "@/types";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

export default function AttendancePage() {
  const { tenant, role } = useTenant();
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [hasEmployeeRecord, setHasEmployeeRecord] = useState<boolean | null>(null);
  const [teamShifts, setTeamShifts] = useState<Shift[]>([]);
  const [latestPings, setLatestPings] = useState<Record<string, { lat: number; lng: number; recorded_at: string }>>({});
  const [violations, setViolations] = useState<GeofenceViolation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [tenant]);

  // Record a location ping every minute while clocked in, so admins/managers
  // can see near-real-time position on the live map (not just the
  // clock-in point).
  useEffect(() => {
    if (!activeShift) return;

    const recordPing = async () => {
      try {
        const pos = await getCurrentPosition();
        await supabase.from("location_pings").insert({
          shift_id: activeShift.id,
          location: `POINT(${pos.lng} ${pos.lat})`,
          accuracy_meters: pos.accuracy,
        });
      } catch {
        // Silently skip a missed ping (e.g. GPS temporarily unavailable) —
        // not worth interrupting the user's work over one failed ping.
      }
    };

    recordPing();
    const pingInterval = setInterval(recordPing, 60000);
    return () => clearInterval(pingInterval);
  }, [activeShift?.id]);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data: empData } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", userData.user.id)
      .eq("tenant_id", tenant!.id)
      .single();

    const employeeId = empData?.id;
    setHasEmployeeRecord(!!employeeId);

    if (employeeId) {
      // Ordered + limited instead of maybeSingle(): if more than one open
      // shift ever exists (e.g. from a past bug or manual test data),
      // maybeSingle() throws and silently resets the UI to "not clocked
      // in" even though a shift really is open. This just takes the most
      // recent one instead of erroring.
      const { data: shiftData } = await supabase
        .from("shifts")
        .select("*, work_site:work_sites(*)")
        .eq("employee_id", employeeId)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(1);
      setActiveShift(shiftData && shiftData.length > 0 ? shiftData[0] : null);
    }

    if (role === "admin" || role === "manager") {
      const { data: teamData } = await supabase
        .from("shifts")
        .select("*, employee:employees(profile:profiles(full_name)), work_site:work_sites(*)")
        .eq("tenant_id", tenant!.id)
        .is("clock_out_at", null);
      setTeamShifts(teamData || []);

      if (teamData && teamData.length > 0) {
        const { data: pingData } = await supabase
          .from("location_pings")
          .select("shift_id, location, recorded_at")
          .in("shift_id", teamData.map((s) => s.id))
          .order("recorded_at", { ascending: false });

        const latestByShift: Record<string, { lat: number; lng: number; recorded_at: string }> = {};
        (pingData || []).forEach((p) => {
          if (latestByShift[p.shift_id]) return; // already have the (more recent) one
          const point = parseGeoPoint(p.location);
          if (point) latestByShift[p.shift_id] = { ...point, recorded_at: p.recorded_at };
        });
        setLatestPings(latestByShift);
      } else {
        setLatestPings({});
      }

      const { data: violData } = await supabase
        .from("geofence_violations")
        .select("*, employee:employees(profile:profiles(full_name))")
        .eq("tenant_id", tenant!.id)
        .is("acknowledged_at", null)
        .order("recorded_at", { ascending: false })
        .limit(10);
      setViolations(violData || []);
    }

    setIsLoading(false);
  };

  const handleClockIn = async () => {
    if (!tenant || isClocking) return;
    setIsClocking(true);
    setGpsError("");

    try {
      const pos = await getCurrentPosition();
      const { data: userData } = await supabase.auth.getUser();
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", userData.user!.id)
        .eq("tenant_id", tenant.id)
        .single();

      if (!empData) {
        setGpsError("Employee record not found");
        setIsClocking(false);
        return;
      }

      const { data: existingOpenShift } = await supabase
        .from("shifts")
        .select("id")
        .eq("employee_id", empData.id)
        .is("clock_out_at", null)
        .limit(1);

      if (existingOpenShift && existingOpenShift.length > 0) {
        setGpsError("You're already clocked in.");
        setIsClocking(false);
        loadData();
        return;
      }

      // Check assigned sites
      const { data: assignedSites } = await supabase
        .from("employee_work_site_assignments")
        .select("work_site:work_sites(*)")
        .eq("employee_id", empData.id);

      const sites = (assignedSites || [])
        .map((a: any) => a.work_site)
        .filter(Boolean) as WorkSite[];

      const withinGeofence = sites.some((site) => {
        const point = parseGeoPoint(site?.location);
        if (!point) return false;
        const dist = haversine(pos.lat, pos.lng, point.lat, point.lng);
        return dist <= site.radius_meters;
      });

      const { data: shift, error } = await supabase
        .from("shifts")
        .insert({
          tenant_id: tenant.id,
          employee_id: empData.id,
          clock_in_at: new Date().toISOString(),
          clock_in_location: `POINT(${pos.lng} ${pos.lat})`,
          clock_in_within_geofence: withinGeofence,
          status: withinGeofence ? "active" : "flagged",
        })
        .select()
        .single();

      if (error) {
        setGpsError(error.message);
      } else if (!withinGeofence && sites.length > 0) {
        await supabase.from("geofence_violations").insert({
          tenant_id: tenant.id,
          shift_id: shift.id,
          employee_id: empData.id,
          work_site_id: sites[0]?.id,
          violation_type: "clock_in_outside",
          location: `POINT(${pos.lng} ${pos.lat})`,
        });
      }

      loadData();
    } catch (err: any) {
      setGpsError(err.message || "Unable to get location. Please enable GPS.");
    }
    setIsClocking(false);
  };

  const handleClockOut = async () => {
    if (!activeShift || isClocking) return;
    setIsClocking(true);

    try {
      const pos = await getCurrentPosition();
      await supabase
        .from("shifts")
        .update({
          clock_out_at: new Date().toISOString(),
          clock_out_location: `POINT(${pos.lng} ${pos.lat})`,
          status: "completed",
        })
        .eq("id", activeShift.id);
      loadData();
    } catch (err: any) {
      setGpsError(err.message || "Unable to get location");
    }
    setIsClocking(false);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="section-title">Attendance</h1>

      {gpsError && (
        <div className="p-4 rounded-xl bg-[var(--danger)]/10 text-[var(--danger)] text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {gpsError}
        </div>
      )}

      {hasEmployeeRecord && (
        <div className="card text-center py-10">
          {activeShift ? (
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--success)]/10 text-[var(--success)]">
                <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                <span className="text-sm font-medium">Clocked in</span>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Since</p>
                <p className="text-lg font-semibold mt-0.5">{formatDateTime(activeShift.clock_in_at)}</p>
                {activeShift.work_site && (
                  <p className="text-sm text-[var(--foreground-muted)] mt-1 flex items-center justify-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {activeShift.work_site.name}
                  </p>
                )}
              </div>
              <button
                onClick={handleClockOut}
                disabled={isClocking}
                className="btn-primary bg-[var(--danger)] hover:bg-[var(--danger)]/90"
              >
                <Square className="h-4 w-4 mr-2" />
                {isClocking ? "Processing..." : "Clock Out"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--foreground-muted)]/10 text-[var(--foreground-muted)]">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Not clocked in</span>
              </div>
              <p className="text-[var(--foreground-muted)] text-sm">
                Ready to start your shift? Make sure you are within a designated work site.
              </p>
              <button onClick={handleClockIn} disabled={isClocking} className="btn-primary">
                <Play className="h-4 w-4 mr-2" />
                {isClocking ? "Getting location..." : "Clock In"}
              </button>
            </div>
          )}
        </div>
      )}

      {(role === "admin" || role === "manager") && (
        <>
          <div className="card p-0 overflow-hidden" style={{ height: "420px" }}>
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-[var(--foreground-muted)]">Loading map...</div>
            ) : (
              <LiveMap shifts={teamShifts} latestPings={latestPings} />
            )}
          </div>

          {violations.length > 0 && (
            <div className="card border-l-4 border-l-[var(--danger)]">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
                Geofence Alerts ({violations.length})
              </h2>
              <div className="space-y-2">
                {violations.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-elevated)]">
                    <div>
                      <p className="font-medium text-sm">{(v.employee as any)?.profile?.full_name || "Unknown"}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {v.violation_type === "clock_in_outside" ? "Clocked in outside geofence" : "Left geofence during shift"}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)]">{formatDateTime(v.recorded_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Currently Clocked In ({teamShifts.length})</h2>
            {teamShifts.length === 0 ? (
              <div className="empty-state py-8">
                <p className="text-[var(--foreground-muted)] text-sm">No one is currently clocked in</p>
              </div>
            ) : (
              <div className="space-y-1">
                {teamShifts.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-[var(--surface-elevated)]/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{shift.employee?.profile?.full_name || "Unknown"}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {shift.work_site?.name || "No site assigned"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)]">{formatDateTime(shift.clock_in_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LiveMap({
  shifts,
  latestPings,
}: {
  shifts: Shift[];
  latestPings: Record<string, { lat: number; lng: number; recorded_at: string }>;
}) {
  const firstSiteLocation = shifts[0]?.work_site?.location;
  const center = parseGeoPoint(firstSiteLocation) || { lat: -18.1248, lng: 178.4501 };

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {shifts.map((shift) => {
        const ping = latestPings[shift.id];
        const point = ping || parseGeoPoint(shift.clock_in_location);
        if (!point) return null;
        return (
          <CircleMarker
            key={shift.id}
            center={[point.lat, point.lng]}
            radius={9}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#22c55e", fillOpacity: 1 }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium">{shift.employee?.profile?.full_name}</p>
                <p className="text-xs text-gray-500">{shift.work_site?.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {ping
                    ? `Updated ${formatDateTime(ping.recorded_at)}`
                    : "No location ping yet — showing clock-in point"}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

function getCurrentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
