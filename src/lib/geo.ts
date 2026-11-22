/**
 * Geography helpers for Wijaya Express (Kabupaten Nganjuk + Jombang).
 *
 * - Haversine distance between two points (straight line).
 * - Service-area bounding box: pickup and destination must both be
 *   inside it (Req 1, Req 9). The box is the union of the OpenStreetMap
 *   boundaries of Kabupaten Nganjuk (relation 9676372) and Kabupaten
 *   Jombang (relation 13851137), via Nominatim, checked 2026-11-22 —
 *   the operator should confirm the exact box against OpenStreetMap
 *   before launch (see tasks.md task 20).
 *
 * Note: a bounding box is a rectangle, so a few places just outside
 * the two regencies still fall inside it — notably Kota Kediri in the
 * far south (about 27 km from Alun-Alun Nganjuk) and Kota Mojokerto
 * in the far east (about 61 km). The operator accepted this ("gpp")
 * on 2026-11-22; a polygon check would be needed to exclude those.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Service area (bounding box = union of the Kabupaten Nganjuk and
 * Kabupaten Jombang boxes from OpenStreetMap).
 * lat [-7.8366, -7.3437], lng [111.7254, 112.4558] — covers both
 * regencies, including Kertosono in the east and Jombang city.
 * OPERATOR: confirm these coordinates before launch; adjust here and
 * the box check below follows automatically.
 */
export const SERVICE_AREA_BOUNDS = {
  minLat: -7.8366,
  maxLat: -7.3437,
  minLng: 111.7254,
  maxLng: 112.4558,
} as const;

/** Centre of the service area (Alun-Alun Nganjuk) — default map centre. */
export const NGANJUK_CENTER: LatLng = { lat: -7.6024, lng: 111.901 };

function assertValidPoint(point: LatLng, name: string): void {
  if (
    !point ||
    typeof point.lat !== "number" ||
    typeof point.lng !== "number" ||
    Number.isNaN(point.lat) ||
    Number.isNaN(point.lng) ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng)
  ) {
    throw new RangeError(`${name} must have finite numeric lat/lng`);
  }
  if (point.lat < -90 || point.lat > 90) {
    throw new RangeError(`${name}.lat must be between -90 and 90`);
  }
  if (point.lng < -180 || point.lng > 180) {
    throw new RangeError(`${name}.lng must be between -180 and 180`);
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Straight-line (great-circle) distance in kilometres between two points.
 * Returns 0 for identical points. Throws on invalid coordinates.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  assertValidPoint(a, "a");
  assertValidPoint(b, "b");
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Straight-line distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/**
 * True when the point is inside the service-area bounding box
 * (edges inclusive). Throws on invalid coordinates.
 */
export function isInsideServiceArea(point: LatLng): boolean {
  assertValidPoint(point, "point");
  return (
    point.lat >= SERVICE_AREA_BOUNDS.minLat &&
    point.lat <= SERVICE_AREA_BOUNDS.maxLat &&
    point.lng >= SERVICE_AREA_BOUNDS.minLng &&
    point.lng <= SERVICE_AREA_BOUNDS.maxLng
  );
}

/**
 * Plain-language warning for a point outside the service area,
 * or null when the point is inside.
 *
 * Used when a geocode result, a map tap, or the GPS location lands
 * outside the box (e.g. "Stasiun Madiun", about 41 km west): the caller
 * shows this message and does NOT move the map or set the point, so the
 * map stays on Nganjuk instead of jumping out to the whole of East
 * Java. `label` is the short name shown to the user (address or "Titik
 * jemput"/"Titik tujuan"); the distance is measured from Alun-Alun
 * Nganjuk. Throws on invalid coordinates.
 */
export function outsideServiceAreaMessage(
  point: LatLng,
  label: string,
): string | null {
  if (isInsideServiceArea(point)) return null;
  const distance = formatDistance(haversineKm(point, NGANJUK_CENTER));
  return (
    `${label} di luar area layanan — titiknya sekitar ${distance} dari ` +
    `Alun-Alun Nganjuk. Wijaya Express hanya melayani Kabupaten Nganjuk dan Jombang, ` +
    `jadi titiknya tidak dipasang dan peta tetap di Nganjuk.`
  );
}

/**
 * Format a distance for display in Indonesian.
 * Under 1 km → metres ("850 m"); 1 km and over → kilometres with one
 * decimal and a comma ("1,2 km", "5,0 km").
 */
export function formatDistance(distanceKm: number): string {
  if (
    typeof distanceKm !== "number" ||
    Number.isNaN(distanceKm) ||
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    throw new RangeError("distance must be a non-negative finite number");
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1).replace(".", ",")} km`;
}
