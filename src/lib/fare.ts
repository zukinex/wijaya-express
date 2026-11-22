/**
 * Tariff for Wijaya Express (Nganjuk & Jombang, cash only).
 *
 * One formula for all three services (ride, parcel, food). For food the
 * fare is the delivery fee only — the food price is paid separately in
 * cash (total = food price + delivery fee).
 *
 *   fare = BASE_FARE_IDR + max(0, ceil(distanceKm - BASE_DISTANCE_KM)) * PER_KM_IDR
 *
 * Money is integer IDR throughout — never floats.
 */

/** Base fare in IDR, covers the first BASE_DISTANCE_KM. */
export const BASE_FARE_IDR = 6000;

/** Kilometres included in the base fare. */
export const BASE_DISTANCE_KM = 2;

/** Price in IDR per started kilometre beyond the base distance. */
export const PER_KM_IDR = 3500;

function assertValidDistance(distanceKm: number): void {
  if (typeof distanceKm !== "number" || Number.isNaN(distanceKm)) {
    throw new RangeError("distance must be a number");
  }
  if (!Number.isFinite(distanceKm)) {
    throw new RangeError("distance must be finite");
  }
  if (distanceKm < 0) {
    throw new RangeError("distance must not be negative");
  }
}

/**
 * Fare in IDR for a trip of `distanceKm` kilometres.
 * 0–2 km → Rp 6.000; 2.1 km → Rp 9.500; 5 km → Rp 16.500;
 * 10 km → Rp 34.000.
 */
export function calculateFare(distanceKm: number): number {
  assertValidDistance(distanceKm);
  const extraKm = Math.max(0, Math.ceil(distanceKm - BASE_DISTANCE_KM));
  return BASE_FARE_IDR + extraKm * PER_KM_IDR;
}

/** Fare in IDR for a trip of `distanceMeters` metres. */
export function calculateFareFromMeters(distanceMeters: number): number {
  if (typeof distanceMeters !== "number" || Number.isNaN(distanceMeters)) {
    throw new RangeError("distance must be a number");
  }
  return calculateFare(distanceMeters / 1000);
}

/** Format an integer IDR amount as Indonesian rupiah, e.g. `Rp 16.500`. */
export function formatRupiah(amountIdr: number): string {
  if (!Number.isInteger(amountIdr) || amountIdr < 0) {
    throw new RangeError("amount must be a non-negative integer (IDR)");
  }
  return `Rp ${new Intl.NumberFormat("id-ID").format(amountIdr)}`;
}
