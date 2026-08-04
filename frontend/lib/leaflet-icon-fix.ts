/**
 * Leaflet's default marker icon paths break when bundled through
 * webpack/Next.js — the marker still positions correctly, it's just
 * invisible because the icon image 404s. This patches Leaflet's
 * default icon to load from a CDN instead. Safe to call multiple
 * times; only runs in the browser.
 */
export function fixLeafletIcons() {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const L = require("leaflet");
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}
