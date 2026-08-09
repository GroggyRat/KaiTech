"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatDateTime, parseGeoPoint } from "@/lib/utils";
import type { Shift, WorkSite, LocationPing } from "@/types";

const markerIcon = new Icon({
  iconUrl: "/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const userIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface LiveMapProps {
  workSites: WorkSite[];
  teamShifts: Shift[];
  latestPings: Record<string, LocationPing>;
  center?: { lat: number; lng: number };
  showOnlyUser?: boolean;
}

export default function LiveMap({ 
  workSites, 
  teamShifts, 
  latestPings, 
  center,
  showOnlyUser 
}: LiveMapProps) {
  const defaultCenter: [number, number] = center 
    ? [center.lat, center.lng] 
    : [-18.1248, 178.4501];

  return (
    <div className="w-full h-96 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <MapContainer
        center={defaultCenter}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {workSites.map((site) => {
          const center = parseGeoPoint(site.location);
          if (!center) return null;
          return (
            <Circle
              key={site.id}
              center={[center.lat, center.lng]}
              radius={site.radius_meters || 100}
              pathOptions={{ color: "var(--accent)", fillOpacity: 0.1, weight: 2 }}
            >
              <Popup>{site.name}</Popup>
            </Circle>
          );
        })}

        {teamShifts.map((shift) => {
          const ping = latestPings[shift.id];
          // LocationPing uses 'location' (PostGIS geography), not latitude/longitude fields
          const loc = ping
            ? parseGeoPoint(ping.location)
            : parseGeoPoint(shift.clock_in_location);
          if (!loc) return null;
          
          return (
            <Marker 
              key={shift.id} 
              position={[loc.lat, loc.lng]} 
              icon={showOnlyUser ? userIcon : markerIcon}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-medium">
                    {shift.employee?.profile?.full_name || "You"}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {shift.work_site?.name || "No site assigned"}
                  </p>
                  <p className="text-xs">
                    {formatDateTime(shift.clock_in_at)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}