"use client";

import { MapContainer, TileLayer, Circle, CircleMarker, useMapEvents } from "react-leaflet";
import type { WorkSite } from "@/types";
import { parseGeoPoint } from "@/lib/utils";

function MapClickHandler({
  isAdding,
  onMapClick,
}: {
  isAdding: boolean;
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (isAdding) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SiteMap({
  sites,
  isAdding,
  newSite,
  onMapClick,
}: {
  sites: WorkSite[];
  isAdding: boolean;
  newSite: { lat: number; lng: number; radius: number } | null;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const parsedSites = sites
    .map((site) => ({ site, point: parseGeoPoint(site.location) }))
    .filter((s): s is { site: WorkSite; point: { lat: number; lng: number } } => s.point !== null);

  const defaultCenter: [number, number] = parsedSites[0]
    ? [parsedSites[0].point.lat, parsedSites[0].point.lng]
    : [-18.1248, 178.4501];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler isAdding={isAdding} onMapClick={onMapClick} />
      {parsedSites.map(({ site, point }) => (
        <Circle
          key={site.id}
          center={[point.lat, point.lng]}
          radius={site.radius_meters}
          pathOptions={{
            color: "var(--accent)",
            fillColor: "var(--accent)",
            fillOpacity: 0.12,
            weight: 2,
          }}
        />
      ))}
      {newSite && (
        <>
          <Circle
            center={[newSite.lat, newSite.lng]}
            radius={newSite.radius}
            pathOptions={{
              color: "var(--success)",
              fillColor: "var(--success)",
              fillOpacity: 0.18,
              weight: 2,
              dashArray: "5, 5",
            }}
          />
          <CircleMarker
            center={[newSite.lat, newSite.lng]}
            radius={9}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#22c55e", fillOpacity: 1 }}
          />
        </>
      )}
    </MapContainer>
  );
}
