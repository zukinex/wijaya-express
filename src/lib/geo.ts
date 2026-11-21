/**
 * Geography helpers for Wijaya Express (Madiun only).
 *
 * - Haversine distance between two points (straight line).
 * - Madiun service-area bounding box: pickup and destination must both
 *   be inside it (Req 1, Req 9). The box is an initial estimate covering
 *   Kota Madiun and the nearby area — the operator should confirm the
 *   exact box against OpenStreetMap before launch (see tasks.md task 20).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Initial Madiun service area (bounding box).
 * lat [-7.70, -7.55], lng [111.45, 111.60] — covers Kota Madiun and the
 * immediate surroundings. OPERATOR: confirm these coordinates before
 * launch; adjust here and the box check below follows automatically.
 */
export const MADIUN_BOUNDS = {
  minLat: -7.7,
  maxLat: -7.55,
  minLng: 111.45,
  maxLng: 111.6,
} as const;

/** Centre of Kota Madiun (Alun-Alun area) — default map centre. */
export const MADIUN_CENTER: LatLng = { lat: -7.6298, lng: 111.5235 };

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
 * True when the point is inside the Madiun service-area bounding box
 * (edges inclusive). Throws on invalid coordinates.
 */
export function isInsideMadiun(point: LatLng): boolean {
  assertValidPoint(point, "point");
  return (
    point.lat >= MADIUN_BOUNDS.minLat &&
    point.lat <= MADIUN_BOUNDS.maxLat &&
    point.lng >= MADIUN_BOUNDS.minLng &&
    point.lng <= MADIUN_BOUNDS.maxLng
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
