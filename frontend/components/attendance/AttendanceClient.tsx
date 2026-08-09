"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { Clock, MapPin, AlertTriangle, Navigation } from "lucide-react";
import { formatDateTime, parseGeoPoint } from "@/lib/utils";
import type { Shift, WorkSite, LocationPing } from "@/types";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 rounded-xl bg-[var(--surface-elevated)]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
    </div>
  ),
});

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function AttendanceClient() {
  const { tenant, role } = useTenant();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [teamShifts, setTeamShifts] = useState<Shift[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [isClocking, setIsClocking] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [hasEmployeeRecord, setHasEmployeeRecord] = useState(false);
  const [violations, setViolations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [latestPings, setLatestPings] = useState<Record<string, LocationPing>>({});
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [tenant]);

  // Get user's current GPS for the personal map
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        // silent fail - not critical
      }
    );
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: empData } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", session.user.id)
      .single();

    setHasEmployeeRecord(!!empData);

    if (empData) {
      const { data: shift } = await supabase
        .from("shifts")
        .select("*, work_site:work_sites(*)")
        .eq("employee_id", empData.id)
        .is("clock_out_at", null)
        .maybeSingle();

      setActiveShift(shift);
    }

    if (role === "admin" || role === "manager") {
      const { data: shifts } = await supabase
        .from("shifts")
        .select("*, employee:employees(profile:profiles(full_name)), work_site:work_sites(*)")
        .eq("tenant_id", tenant!.id)
        .is("clock_out_at", null);

      setTeamShifts(shifts || []);

      const { data: sites } = await supabase
        .from("work_sites")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("status", "active");

      setWorkSites(sites || []);

      const shiftIds = (shifts || []).map((s) => s.id);
      if (shiftIds.length > 0) {
        const { data: pings } = await supabase
          .from("location_pings")
          .select("*")
          .in("shift_id", shiftIds)
          .order("created_at", { ascending: false });

        const pingMap: Record<string, LocationPing> = {};
        for (const ping of (pings || [])) {
          if (!pingMap[ping.shift_id]) pingMap[ping.shift_id] = ping;
        }
        setLatestPings(pingMap);
      } else {
        setLatestPings({});
      }

      const { data: viols } = await supabase
        .from("geofence_violations")
        .select("*, employee:employees(profile:profiles(full_name))")
        .eq("tenant_id", tenant!.id)
        .gte("recorded_at", new Date(Date.now() - 86400000).toISOString())
        .order("recorded_at", { ascending: false });

      setViolations(viols || []);
    }

    setIsLoading(false);
  };

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation is not supported in this environment."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
  };

  const handleClockIn = async () => {
    setIsClocking(true);
    setGpsError(null);

    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setGpsError("You must be signed in.");
        setIsClocking(false);
        return;
      }

      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", session.user.id)
        .single();

      if (!empData) {
        setGpsError("Employee record not found.");
        setIsClocking(false);
        return;
      }

      const { data: sites } = await supabase
        .from("work_sites")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("status", "active");

      let matchedSite: WorkSite | null = null;
      for (const site of (sites || [])) {
        const center = parseGeoPoint(site.location);
        if (!center) continue;
        const radius = site.radius_meters || 100;
        const distance = haversineDistance(lat, lng, center.lat, center.lng);
        if (distance <= radius) {
          matchedSite = site;
          break;
        }
      }

      if (!matchedSite) {
        setGpsError("You are not within any designated work site.");
        setIsClocking(false);
        return;
      }

      const { data: existingShift } = await supabase
        .from("shifts")
        .select("id")
        .eq("employee_id", empData.id)
        .is("clock_out_at", null)
        .limit(1);

      if (existingShift && existingShift.length > 0) {
        setGpsError("You already have an active shift.");
        setIsClocking(false);
        return;
      }

      const { data: shift, error } = await supabase
        .from("shifts")
        .insert({
          employee_id: empData.id,
          tenant_id: tenant!.id,
          work_site_id: matchedSite.id,
          clock_in_at: new Date().toISOString(),
          clock_in_location: `POINT(${lng} ${lat})`,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("location_pings").insert({
        shift_id: shift.id,
        latitude: lat,
        longitude: lng,
        accuracy: position.coords.accuracy,
      });

      setActiveShift(shift);
      
      // Update my location on the map
      setMyLocation({ lat, lng });
    } catch (err: any) {
      setGpsError(err.message || "Failed to clock in");
    }

    setIsClocking(false);
  };

  const handleClockOut = async () => {
    if (!activeShift) return;

    setIsClocking(true);
    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      await supabase
        .from("shifts")
        .update({
          clock_out_at: new Date().toISOString(),
          clock_out_location: `POINT(${lng} ${lat})`,
        })
        .eq("id", activeShift.id);

      await supabase.from("location_pings").insert({
        shift_id: activeShift.id,
        latitude: lat,
        longitude: lng,
        accuracy: position.coords.accuracy,
      });

      setActiveShift(null);
    } catch (err: any) {
      setGpsError(err.message || "Failed to clock out");
    }
    setIsClocking(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="section-title">Attendance</h1>

      {gpsError && (
        <div className="bg-[var(--danger)]/10 text-[var(--danger)] p-3 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {gpsError}
        </div>
      )}

      {hasEmployeeRecord && (
        <div className="card">
          {activeShift ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--success)]">
                <Clock className="h-5 w-5" />
                <span className="font-medium">Clocked in</span>
              </div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Since {formatDateTime(activeShift.clock_in_at)}
              </p>
              {activeShift.work_site && (
                <p className="text-sm flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {activeShift.work_site.name}
                </p>
              )}
              <button
                onClick={handleClockOut}
                disabled={isClocking}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isClocking ? "Processing…" : "Clock Out"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
                <Clock className="h-5 w-5" />
                <span className="font-medium">Clocked out</span>
              </div>
              <button
                onClick={handleClockIn}
                disabled={isClocking}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {isClocking ? "Processing…" : "Clock In"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Personal Location Map - visible to everyone */}
      {myLocation && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Navigation className="h-5 w-5 text-[var(--accent)]" />
            My Location
          </h2>
          <LiveMap
            workSites={workSites}
            teamShifts={activeShift ? [activeShift] : []}
           latestPings={activeShift ? { [activeShift.id]: { 
            shift_id: activeShift.id, 
            latitude: myLocation.lat, 
            longitude: myLocation.lng 
          } as unknown as LocationPing } : {}}
            center={myLocation}
            showOnlyUser={true}
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-2">
            {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
          </p>
        </div>
      )}

      {/* Team Map - admin/manager only */}
      {(role === "admin" || role === "manager") && (
        <>
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Live Team Map</h2>
            <LiveMap
              workSites={workSites}
              teamShifts={teamShifts}
              latestPings={latestPings}
            />
            {teamShifts.length === 0 && (
              <p className="text-sm text-[var(--foreground-muted)] text-center py-8">
                No active shifts to display
              </p>
            )}
          </div>

          {violations.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--danger)]">
                <AlertTriangle className="h-5 w-5" />
                Geofence Violations (24h)
              </h2>
              <div className="space-y-2">
                {violations.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-2 bg-[var(--danger)]/5 rounded-lg"
                  >
                    <span className="font-medium">
                      {v.employee?.profile?.full_name || "Unknown"}
                    </span>
                    <span className="text-sm text-[var(--foreground-muted)]">
                      {formatDateTime(v.recorded_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}