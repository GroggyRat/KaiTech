import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses a PostGIS geography(point) column value as returned by
 * Supabase/PostgREST into a plain { lat, lng } object.
 *
 * PostgREST may return geography columns as:
 * - GeoJSON: { type: "Point", coordinates: [lng, lat] }
 * - WKT string: "POINT(178.4501 -18.1248)" or "SRID=4326;POINT(178.4501 -18.1248)"
 * - Already-parsed object: { lat, lng }
 *
 * Falls back to null if the shape is unrecognized.
 */
export function parseGeoPoint(
  value: unknown
): { lat: number; lng: number } | null {
  if (!value) return null;

  // Already in { lat, lng } shape
  if (
    typeof value === "object" &&
    value !== null &&
    "lat" in value &&
    "lng" in value &&
    typeof (value as any).lat === "number" &&
    typeof (value as any).lng === "number"
  ) {
    return { lat: (value as any).lat, lng: (value as any).lng };
  }

  // GeoJSON Point: { type: "Point", coordinates: [lng, lat] }
  if (
    typeof value === "object" &&
    value !== null &&
    (value as any).type === "Point" &&
    Array.isArray((value as any).coordinates)
  ) {
    const [lng, lat] = (value as any).coordinates;
    if (typeof lat === "number" && typeof lng === "number") {
      return { lat, lng };
    }
  }

  // WKT string: "POINT(lng lat)" or "SRID=4326;POINT(lng lat)"
  if (typeof value === "string") {
    // Strip SRID prefix if present
    const wkt = value.replace(/^SRID=\d+;/i, "").trim();
    const match = wkt.match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
    if (match) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  return null;
}
