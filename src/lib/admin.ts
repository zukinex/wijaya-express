/**
 * Admin domain for Wijaya Express (Req 8, Phase 4 tasks 15–16).
 *
 * The admin (operator) signs in with Supabase Auth and works from the
 * /admin view:
 *   1. See ALL orders, newest first, filtered by status and service;
 *      open one order to see its full timeline (created → accepted →
 *      picked_up → delivered → completed/cancelled, with times).
 *   2. Manage drivers: the 5 launch drivers with online status,
 *      vehicle plate, and an active/inactive switch. An inactive
 *      driver never receives orders (the driver view already hides
 *      new orders from inactive drivers — see driver.ts).
 *   3. Edit the tariff (base fare, included km, per-km rate) — writes
 *      to the single `tariffs` row (id = 1).
 *
 * Tariff-change rule (task 16, Req 3): the fare is computed from the
 * tariffs row AT ORDER CREATION and stored on the order (`fare_idr`).
 * An order created after a change uses the new tariff; an existing
 * order keeps its stored fare — nothing ever re-fares a stored order.
 * `createOrder` (orders.ts) already works this way; the tests in
 * admin.test.ts prove the rule end to end at the lib level.
 *
 * All database access goes through the anon key + the admin's own Auth
 * session (RLS: admin reads all orders/drivers/tariffs and may update
 * drivers + tariffs — see supabase-rls.sql). The service-role key is
 * never used here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTariff,
  type OrderRow,
  type OrderService,
  type OrderStatus,
  type TariffRow,
} from "./orders";

export interface AdminOrderFilters {
  status?: OrderStatus | "all";
  service?: OrderService | "all";
}

type JoinedOrderRow = OrderRow & {
  driver?: {
    profiles?: { display_name: string; phone: string } | null;
  } | null;
};

/** Flatten the drivers → profiles join into the OrderRow.driver shape. */
function flattenOrderDriver(row: JoinedOrderRow): OrderRow {
  const driverProfile = row.driver?.profiles ?? null;
  return {
    ...(row as OrderRow),
    driver: driverProfile
      ? {
          display_name: driverProfile.display_name,
          phone: driverProfile.phone,
        }
      : null,
  };
}

/**
 * All orders, newest first, optionally filtered by status and service.
 * The assigned driver's name + phone are joined in (null before accept).
 * Throws a plain-language Error on failure.
 */
export async function listAllOrders(
  client: SupabaseClient,
  filters: AdminOrderFilters = {},
): Promise<OrderRow[]> {
  let query = client
    .from("orders")
    .select("*, driver:drivers (profiles (display_name, phone))")
    .order("created_at", { ascending: false });
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.service && filters.service !== "all") {
    query = query.eq("service", filters.service);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal memuat order: ${error.message}`);
  }
  return ((data ?? []) as JoinedOrderRow[]).map(flattenOrderDriver);
}

export interface TimelineEntry {
  key: string;
  label: string;
  /** ISO timestamp of the step, null when it has not happened. */
  at: string | null;
  done: boolean;
}

const CANCELLED_BY_LABELS: Record<string, string> = {
  passenger: "penumpang",
  driver: "driver",
  admin: "admin",
};

/**
 * The full timeline of an order as display entries, in lifecycle order.
 * Steps that never happened have `at: null` and `done: false`. For a
 * cancelled order a final "Dibatalkan" entry is appended (with who +
 * reason when recorded).
 */
export function getOrderTimeline(order: OrderRow): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { key: "created", label: "Order dibuat", at: order.created_at, done: true },
    {
      key: "accepted",
      label: "Diterima driver",
      at: order.accepted_at,
      done: order.accepted_at !== null,
    },
    {
      key: "picked_up",
      label:
        order.service === "food"
          ? "Makanan dibeli di warung"
          : "Penumpang naik / barang diambil",
      at: order.picked_up_at,
      done: order.picked_up_at !== null,
    },
    {
      key: "delivered",
      label: "Sampai tujuan",
      at: order.delivered_at,
      done: order.delivered_at !== null,
    },
    {
      key: "completed",
      label: "Selesai — tunai diterima",
      at: order.completed_at,
      done: order.completed_at !== null,
    },
  ];
  if (order.status === "cancelled") {
    const by = order.cancelled_by
      ? ` oleh ${CANCELLED_BY_LABELS[order.cancelled_by] ?? order.cancelled_by}`
      : "";
    const reason = order.cancel_reason ? ` — ${order.cancel_reason}` : "";
    entries.push({
      key: "cancelled",
      label: `Dibatalkan${by}${reason}`,
      at: order.cancelled_at,
      done: true,
    });
  }
  return entries;
}

export interface AdminDriverRow {
  id: string;
  display_name: string;
  phone: string;
  vehicle_plate: string;
  vehicle_model: string | null;
  is_online: boolean;
  is_active: boolean;
  last_seen_at: string | null;
}

/**
 * All drivers with their profile (name + phone), sorted by name.
 * Throws a plain-language Error on failure.
 */
export async function listAllDrivers(
  client: SupabaseClient,
): Promise<AdminDriverRow[]> {
  const { data, error } = await client
    .from("drivers")
    .select(
      "id, vehicle_plate, vehicle_model, is_online, is_active, last_seen_at, profiles (display_name, phone)",
    );
  if (error) {
    throw new Error(`Gagal memuat driver: ${error.message}`);
  }
  const rows = ((data ?? []) as unknown as Array<{
    id: string;
    vehicle_plate: string;
    vehicle_model: string | null;
    is_online: boolean;
    is_active: boolean;
    last_seen_at: string | null;
    profiles: { display_name: string; phone: string } | null;
  }>).map((row) => ({
    id: row.id,
    display_name: row.profiles?.display_name ?? "—",
    phone: row.profiles?.phone ?? "—",
    vehicle_plate: row.vehicle_plate,
    vehicle_model: row.vehicle_model,
    is_online: row.is_online,
    is_active: row.is_active,
    last_seen_at: row.last_seen_at,
  }));
  rows.sort((a, b) => a.display_name.localeCompare(b.display_name, "id-ID"));
  return rows;
}

/**
 * Switch a driver active/inactive. Inactive drivers never receive
 * orders (the driver view gates on `is_active`). Throws a
 * plain-language Error on failure.
 */
export async function setDriverActive(
  client: SupabaseClient,
  driverId: string,
  active: boolean,
): Promise<void> {
  const { error } = await client
    .from("drivers")
    .update({ is_active: active })
    .eq("id", driverId);
  if (error) {
    throw new Error(`Gagal mengubah status driver: ${error.message}`);
  }
}

export interface TariffInput {
  baseFareIdr: number;
  baseDistanceKm: number;
  perKmIdr: number;
}

export type TariffValidationErrors = Partial<
  Record<"baseFareIdr" | "baseDistanceKm" | "perKmIdr", string>
>;

const MAX_IDR = 1_000_000;

/** Validate a tariff edit; empty object means valid. */
export function validateTariffInput(
  input: TariffInput,
): TariffValidationErrors {
  const errors: TariffValidationErrors = {};
  if (
    typeof input.baseFareIdr !== "number" ||
    !Number.isInteger(input.baseFareIdr) ||
    input.baseFareIdr <= 0 ||
    input.baseFareIdr > MAX_IDR
  ) {
    errors.baseFareIdr =
      "Tarif dasar harus bilangan bulat rupiah lebih dari 0 (maks Rp 1.000.000).";
  }
  if (
    typeof input.baseDistanceKm !== "number" ||
    Number.isNaN(input.baseDistanceKm) ||
    !Number.isFinite(input.baseDistanceKm) ||
    input.baseDistanceKm < 0 ||
    input.baseDistanceKm > 100
  ) {
    errors.baseDistanceKm =
      "Jarak yang termasuk tarif dasar harus angka 0–100 km.";
  }
  if (
    typeof input.perKmIdr !== "number" ||
    !Number.isInteger(input.perKmIdr) ||
    input.perKmIdr <= 0 ||
    input.perKmIdr > MAX_IDR
  ) {
    errors.perKmIdr =
      "Tarif per km harus bilangan bulat rupiah lebih dari 0 (maks Rp 1.000.000).";
  }
  return errors;
}

/**
 * Save the tariff edit to the single tariffs row (id = 1) and return
 * the updated row. Throws a plain-language Error when validation fails
 * or the update fails. Orders created after this call use the new
 * tariff; existing orders keep their stored fare (task 16).
 */
export async function updateTariff(
  client: SupabaseClient,
  input: TariffInput,
): Promise<TariffRow> {
  const errors = validateTariffInput(input);
  const firstError = Object.values(errors)[0];
  if (firstError) {
    throw new Error(firstError);
  }
  const { data, error } = await client
    .from("tariffs")
    .update({
      base_fare_idr: input.baseFareIdr,
      base_distance_km: input.baseDistanceKm,
      per_km_idr: input.perKmIdr,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id, base_fare_idr, base_distance_km, per_km_idr")
    .single();
  if (error || !data) {
    throw new Error(
      `Gagal menyimpan tarif: ${error?.message ?? "tidak ada respons dari server"}`,
    );
  }
  return data as TariffRow;
}

/** Re-exported for the admin page: read the current tariffs row. */
export { getTariff };
