/**
 * Order domain for Wijaya Express (Req 1, 2, 3, 5, 6).
 *
 * Guest passengers (no login) create orders. The order flow:
 *   1. Validate the input (name, Indonesian phone, both points inside
 *      the service-area box, food details when service is food).
 *   2. Read the current `tariffs` row from Supabase — the single source
 *      of truth for the fare. If the row cannot be read, fall back to
 *      the launch defaults mirrored in `fare.ts`.
 *   3. Insert into `orders` with status `created` and return the id;
 *      the UI routes to `/order/[id]`.
 *
 * Money is integer IDR throughout. Phone numbers are stored normalized
 * to the international format (+62...).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE_DISTANCE_KM,
  BASE_FARE_IDR,
  PER_KM_IDR,
} from "./fare";
import { isInsideServiceArea, type LatLng } from "./geo";

export type OrderService = "ride" | "parcel" | "food";
export type OrderStatus =
  | "created"
  | "accepted"
  | "picked_up"
  | "delivered"
  | "completed"
  | "cancelled";

export const ORDER_SERVICES: OrderService[] = ["ride", "parcel", "food"];

export const SERVICE_LABELS: Record<OrderService, string> = {
  ride: "Antar Orang",
  parcel: "Antar Barang",
  food: "Antar Makanan",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  created: "Mencari driver",
  accepted: "Driver ditemukan",
  picked_up: "Driver sudah di titik jemput",
  delivered: "Sampai tujuan",
  completed: "Selesai — tunai diterima",
  cancelled: "Dibatalkan",
};

export interface TariffRow {
  id: number;
  base_fare_idr: number;
  base_distance_km: number;
  per_km_idr: number;
}

export interface OrderInput {
  service: OrderService;
  passengerName: string;
  passengerPhone: string;
  pickup: { address: string; point: LatLng };
  dropoff: { address: string; point: LatLng };
  distanceKm: number;
  /** Food only: warung/resto name. */
  foodWarung?: string;
  /** Food only: free-text order (menu items + quantity). */
  foodOrder?: string;
}

export interface OrderRow {
  id: string;
  service: OrderService;
  status: OrderStatus;
  passenger_name: string;
  passenger_phone: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  fare_idr: number;
  food_details: string | null;
  food_price_idr: number | null;
  driver_id: string | null;
  created_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  /** Joined driver profile (present once the order is accepted). */
  driver?: {
    display_name: string;
    phone: string;
  } | null;
}

/**
 * Normalize an Indonesian phone number to +62... format.
 * Returns null when the input cannot be a valid Indonesian mobile number.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9+]/g, "");
  let normalized: string;
  if (digits.startsWith("+62")) {
    normalized = digits;
  } else if (digits.startsWith("62")) {
    normalized = `+${digits}`;
  } else if (digits.startsWith("0")) {
    normalized = `+62${digits.slice(1)}`;
  } else if (digits.startsWith("8")) {
    normalized = `+62${digits}`;
  } else {
    return null;
  }
  // Indonesian mobile: +62 8xx, 10–13 digits total after the country code
  // is stripped (08 + 8–11 more digits).
  if (!/^\+628\d{8,11}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export type OrderValidationErrors = Partial<
  Record<
    | "service"
    | "passengerName"
    | "passengerPhone"
    | "pickup"
    | "dropoff"
    | "distance"
    | "foodWarung"
    | "foodOrder",
    string
  >
>;

/** Validate an order input; empty object means valid. */
export function validateOrderInput(input: OrderInput): OrderValidationErrors {
  const errors: OrderValidationErrors = {};

  if (!ORDER_SERVICES.includes(input.service)) {
    errors.service = "Pilih layanan dulu.";
  }
  if (!input.passengerName || input.passengerName.trim().length < 2) {
    errors.passengerName = "Isi nama penumpang (minimal 2 huruf).";
  }
  if (!normalizePhone(input.passengerPhone)) {
    errors.passengerPhone =
      "Nomor HP tidak valid — contoh: 0812 3456 7890.";
  }
  if (!input.pickup.address || input.pickup.address.trim() === "") {
    errors.pickup = "Isi alamat jemput.";
  } else {
    try {
      if (!isInsideServiceArea(input.pickup.point)) {
        errors.pickup = "Titik jemput di luar area layanan (Kabupaten Nganjuk dan Jombang).";
      }
    } catch {
      errors.pickup = "Titik jemput tidak valid — pilih di peta.";
    }
  }
  if (!input.dropoff.address || input.dropoff.address.trim() === "") {
    errors.dropoff = "Isi alamat tujuan.";
  } else {
    try {
      if (!isInsideServiceArea(input.dropoff.point)) {
        errors.dropoff = "Titik tujuan di luar area layanan (Kabupaten Nganjuk dan Jombang).";
      }
    } catch {
      errors.dropoff = "Titik tujuan tidak valid — pilih di peta.";
    }
  }
  if (
    typeof input.distanceKm !== "number" ||
    Number.isNaN(input.distanceKm) ||
    !Number.isFinite(input.distanceKm) ||
    input.distanceKm <= 0.01
  ) {
    errors.distance =
      "Jarak tidak valid — titik jemput dan tujuan harus berbeda.";
  }
  if (input.service === "food") {
    if (!input.foodWarung || input.foodWarung.trim() === "") {
      errors.foodWarung = "Isi nama warung/restonya.";
    }
    if (!input.foodOrder || input.foodOrder.trim() === "") {
      errors.foodOrder = "Tulis pesananmu (menu + jumlah).";
    }
  }
  return errors;
}

/** Fare for a distance using a tariffs row from the database. */
export function calculateFareWithTariff(
  distanceKm: number,
  tariff: TariffRow,
): number {
  if (
    typeof distanceKm !== "number" ||
    Number.isNaN(distanceKm) ||
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    throw new RangeError("distance must be a non-negative finite number");
  }
  const extraKm = Math.max(
    0,
    Math.ceil(distanceKm - tariff.base_distance_km),
  );
  return tariff.base_fare_idr + extraKm * tariff.per_km_idr;
}

/** Read the current tariffs row (id = 1); null when it cannot be read. */
export async function getTariff(
  client: SupabaseClient,
): Promise<TariffRow | null> {
  const { data, error } = await client
    .from("tariffs")
    .select("id, base_fare_idr, base_distance_km, per_km_idr")
    .eq("id", 1)
    .single();
  if (error || !data) return null;
  return data as TariffRow;
}

/** The launch-default tariff (mirrors fare.ts constants). */
export function defaultTariff(): TariffRow {
  return {
    id: 1,
    base_fare_idr: BASE_FARE_IDR,
    base_distance_km: BASE_DISTANCE_KM,
    per_km_idr: PER_KM_IDR,
  };
}

/**
 * Insert a validated order and return its id. Throws a plain-language
 * Error when validation fails or the insert fails.
 */
export async function createOrder(
  client: SupabaseClient,
  input: OrderInput,
): Promise<{ id: string }> {
  const errors = validateOrderInput(input);
  const firstError = Object.values(errors)[0];
  if (firstError) {
    throw new Error(firstError);
  }
  const tariff = (await getTariff(client)) ?? defaultTariff();
  const fare = calculateFareWithTariff(input.distanceKm, tariff);
  const phone = normalizePhone(input.passengerPhone) as string;
  const foodDetails =
    input.service === "food"
      ? `Warung: ${input.foodWarung?.trim()}\nPesanan: ${input.foodOrder?.trim()}`
      : null;

  const { data, error } = await client
    .from("orders")
    .insert({
      service: input.service,
      status: "created",
      passenger_name: input.passengerName.trim(),
      passenger_phone: phone,
      pickup_address: input.pickup.address.trim(),
      pickup_lat: input.pickup.point.lat,
      pickup_lng: input.pickup.point.lng,
      dropoff_address: input.dropoff.address.trim(),
      dropoff_lat: input.dropoff.point.lat,
      dropoff_lng: input.dropoff.point.lng,
      distance_km: Math.round(input.distanceKm * 1000) / 1000,
      fare_idr: fare,
      food_details: foodDetails,
      food_price_idr: null,
      driver_id: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Gagal membuat pesanan: ${error?.message ?? "tidak ada respons dari server"}`,
    );
  }
  return { id: (data as { id: string }).id };
}

/** Fetch one order by id (for the status page). Returns null when missing. */
export async function getOrderById(
  client: SupabaseClient,
  id: string,
): Promise<OrderRow | null> {
  const { data, error } = await client
    .from("orders")
    .select(
      "*, driver:drivers (profiles (display_name, phone))",
    )
    .eq("id", id)
    .single();
  if (error || !data) return null;
  const row = data as OrderRow & {
    driver?: { profiles?: { display_name: string; phone: string } | null } | null;
  };
  // Flatten the nested join: drivers -> profiles into a single driver object.
  const driverProfile = row.driver?.profiles ?? null;
  return {
    ...(row as OrderRow),
    driver: driverProfile
      ? { display_name: driverProfile.display_name, phone: driverProfile.phone }
      : null,
  };
}
