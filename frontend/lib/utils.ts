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