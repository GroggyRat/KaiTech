import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses a PostGIS geography(point) column value as returned by
 * Supabase/PostgREST into a plain { lat, lng } object.
 *
 * Handles: {lat, lng} objects, GeoJSON, WKT strings, and hex EWKB.
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

  // String: hex EWKB, WKT, or SRID-prefixed WKT
  if (typeof value === "string") {
    // Try hex EWKB first (PostGIS default binary output)
    const ewkb = parseHexEWKB(value);
    if (ewkb) return ewkb;

    // WKT: "POINT(lng lat)" or "SRID=4326;POINT(lng lat)"
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

// ─── Parse PostGIS hex EWKB ─────────────────────────────────────
export function parseHexEWKB(hex: string): { lat: number; lng: number } | null {
  if (!hex || hex.length < 42 || !/^[0-9a-fA-F]+$/.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }

  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;

  const type = view.getUint32(1, littleEndian);
  const hasSRID = (type & 0x20000000) !== 0;
  const geometryType = type & 0x0FFFFFFF;

  if (geometryType !== 1) return null; // Not a Point

  let offset = 5;
  if (hasSRID) offset += 4;

  if (bytes.length < offset + 16) return null;

  const x = view.getFloat64(offset, littleEndian);
  const y = view.getFloat64(offset + 8, littleEndian);

  return { lat: y, lng: x };
}

export function formatCurrency(amount: number, currency = "FJD"): string {
  return new Intl.NumberFormat("en-FJ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-FJ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-FJ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Fiji PAYE calculation based on 2024-2025 brackets
export function calculatePAYE(annualGross: number): number {
  if (annualGross <= 30000) return 0;
  if (annualGross <= 50000) return (annualGross - 30000) * 0.18;
  if (annualGross <= 270000) return 3600 + (annualGross - 50000) * 0.20;
  if (annualGross <= 300000) return 47600 + (annualGross - 270000) * 0.33;
  if (annualGross <= 350000) return 57500 + (annualGross - 300000) * 0.34;
  if (annualGross <= 400000) return 74500 + (annualGross - 350000) * 0.35;
  if (annualGross <= 450000) return 92000 + (annualGross - 400000) * 0.36;
  if (annualGross <= 500000) return 110000 + (annualGross - 450000) * 0.37;
  if (annualGross <= 1000000) return 128500 + (annualGross - 500000) * 0.38;
  return 318500 + (annualGross - 1000000) * 0.39;
}

// FNPF calculations (current rates: employee 8%, employer 10%)
export function calculateFNPF(grossPay: number) {
  return {
    employee: grossPay * 0.08,
    employer: grossPay * 0.10,
  };
}

export function generateUUID(): string {
  return crypto.randomUUID();
}