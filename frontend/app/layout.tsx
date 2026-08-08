import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "KaiWorkforce",
  description: "Payroll & HR for staffing agencies",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#007AFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--background)] flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="py-4 text-center text-xs text-[var(--foreground-muted)]">
          Made by a Human :)
        </footer>
      </body>
    </html>
  );
}