/**
 * Routing + geocoding for Wijaya Express (free services only, Req 9).
 *
 * - Road distance: OSRM demo server (router.project-osrm.org). It is a
 *   shared test service with no SLA, so ANY failure falls back to
 *   Haversine straight-line distance × 1.3 (typical road factor in a
 *   small city) and the result is flagged `isEstimate: true` so the fare
 *   is shown as "estimasi".
 * - Geocoding: Nominatim (OpenStreetMap). Usage policy: at most
 *   1 request/second, proper identification. `createGeocoder()` enforces
 *   both a trailing debounce (for typing) and the 1 req/s throttle.
 *   Results are biased to the Madiun bounding box.
 *
 * No paid maps API is ever called (no Google Maps key).
 */
import { haversineKm, MADIUN_BOUNDS, type LatLng } from "./geo";

export type FetchFn = typeof fetch;

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

/** Identifies Wijaya Express to the free services (Nominatim policy). */
const USER_AGENT = "WijayaExpress/0.1 (ojek lokal Madiun)";

export interface RouteResult {
  /** Distance in kilometres (road distance, or Haversine × 1.3 fallback). */
  distanceKm: number;
  distanceMeters: number;
  /** Route line as [lng, lat] pairs (OSRM only; null on fallback). */
  geometry: Array<[number, number]> | null;
  /** True when the distance is the Haversine fallback, not a real route. */
  isEstimate: boolean;
  source: "osrm" | "fallback";
}

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    geometry?: { coordinates?: Array<[number, number]> };
  }>;
}

function fallbackRoute(from: LatLng, to: LatLng): RouteResult {
  const distanceKm = haversineKm(from, to) * 1.3;
  return {
    distanceKm,
    distanceMeters: distanceKm * 1000,
    geometry: null,
    isEstimate: true,
    source: "fallback",
  };
}

/**
 * Road distance between two points via OSRM, with Haversine × 1.3
 * fallback on any failure (network error, non-OK response, bad payload,
 * timeout). Never throws for routing problems — it always returns a
 * usable (possibly estimated) distance.
 */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  fetchFn: FetchFn = fetch,
  timeoutMs = 8000,
): Promise<RouteResult> {
  const url =
    `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) return fallbackRoute(from, to);
    const data = (await response.json()) as OsrmResponse;
    const route = data.code === "Ok" ? data.routes?.[0] : undefined;
    if (!route || typeof route.distance !== "number") {
      return fallbackRoute(from, to);
    }
    return {
      distanceKm: route.distance / 1000,
      distanceMeters: route.distance,
      geometry: route.geometry?.coordinates ?? null,
      isEstimate: false,
      source: "osrm",
    };
  } catch {
    return fallbackRoute(from, to);
  } finally {
    clearTimeout(timer);
  }
}

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
}

/**
 * Geocode one address via Nominatim, biased to the Madiun area.
 * Returns [] when nothing matches. Throws on an empty query or a
 * failed request (caller shows a plain-language error).
 */
export async function geocodeAddress(
  query: string,
  fetchFn: FetchFn = fetch,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed === "") {
    throw new Error("Alamat kosong — isi alamat dulu.");
  }
  const params = new URLSearchParams({
    format: "json",
    limit: "5",
    countrycodes: "id",
    viewbox: `${MADIUN_BOUNDS.minLng},${MADIUN_BOUNDS.minLat},${MADIUN_BOUNDS.maxLng},${MADIUN_BOUNDS.maxLat}`,
    bounded: "1",
    q: trimmed,
  });
  const response = await fetchFn(`${NOMINATIM_BASE}?${params.toString()}`, {
    // Browsers forbid overriding User-Agent; they attach the page's
    // Referer automatically, which still identifies the app. In
    // non-browser runtimes this header is sent as-is.
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error("Pencarian alamat gagal — periksa koneksi lalu coba lagi.");
  }
  const items = (await response.json()) as NominatimItem[];
  return items
    .filter(
      (item) =>
        typeof item.display_name === "string" &&
        typeof item.lat === "string" &&
        typeof item.lon === "string" &&
        Number.isFinite(Number(item.lat)) &&
        Number.isFinite(Number(item.lon)),
    )
    .map((item) => ({
      displayName: item.display_name as string,
      lat: Number(item.lat),
      lng: Number(item.lon),
    }));
}

/**
 * Reverse-geocode a point via Nominatim (for the "Lokasi saya" button).
 * Returns the display name, or null when nothing matches / on failure.
 */
export async function reverseGeocode(
  point: LatLng,
  fetchFn: FetchFn = fetch,
): Promise<string | null> {
  const params = new URLSearchParams({
    format: "json",
    lat: String(point.lat),
    lon: String(point.lng),
    zoom: "18",
  });
  try {
    const response = await fetchFn(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      },
    );
    if (!response.ok) return null;
    const item = (await response.json()) as { display_name?: string };
    return typeof item.display_name === "string" ? item.display_name : null;
  } catch {
    return null;
  }
}

export interface GeocoderOptions {  fetchFn?: FetchFn;
  /** Trailing debounce for typing (default 400 ms). */
  debounceMs?: number;
  /** Minimum gap between real requests (default 1000 ms, Nominatim policy). */
  minIntervalMs?: number;
}

export interface Geocoder {
  /**
   * Debounced + throttled geocode. Rapid calls collapse into one request
   * for the latest query; every caller gets that request's result.
   */
  geocode(query: string): Promise<GeocodeResult[]>;
}

/**
 * A Nominatim geocoder that respects the usage policy: at most one real
 * request per `minIntervalMs`, with a trailing debounce so typing an
 * address does not spam the service.
 */
export function createGeocoder(options: GeocoderOptions = {}): Geocoder {
  const fetchFn = options.fetchFn ?? fetch;
  const debounceMs = options.debounceMs ?? 400;
  const minIntervalMs = options.minIntervalMs ?? 1000;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRequestAt = 0;
  let latestQuery = "";
  let waiters: Array<{
    resolve: (results: GeocodeResult[]) => void;
    reject: (error: unknown) => void;
  }> = [];

  const fire = () => {
    timer = null;
    const query = latestQuery;
    const pending = waiters;
    waiters = [];
    const now = Date.now();
    const delay = Math.max(0, minIntervalMs - (now - lastRequestAt));
    setTimeout(() => {
      lastRequestAt = Date.now();
      geocodeAddress(query, fetchFn).then(
        (results) => pending.forEach((w) => w.resolve(results)),
        (error) => pending.forEach((w) => w.reject(error)),
      );
    }, delay);
  };

  return {
    geocode(query: string): Promise<GeocodeResult[]> {
      return new Promise<GeocodeResult[]>((resolve, reject) => {
        latestQuery = query;
        waiters.push({ resolve, reject });
        if (timer) clearTimeout(timer);
        timer = setTimeout(fire, debounceMs);
      });
    },
  };
}
