/**
 * Driver domain for Wijaya Express (Req 4, 5, 6, 7).
 *
 * Drivers sign in with Supabase Auth (email + password) and work from
 * the /driver view:
 *   1. Toggle online/offline — only online drivers see new orders.
 *   2. See `created` orders live (Supabase Realtime in the page, with
 *      a polling fallback — same pattern as the passenger status page).
 *   3. Accept an order with the atomic first-accept guard: the UPDATE
 *      only succeeds when the order is still `created`. The database
 *      returns 0 rows for the loser, and the UI shows "sudah diambil
 *      driver lain".
 *   4. Move the active order forward (accepted → picked_up → delivered
 *      → completed) with the same status guard, so a stale phone cannot
 *      skip a step. For food orders, picked_up requires the food price
 *      paid at the warung (the passenger then sees total cash = food
 *      price + delivery fee).
 *   5. Cancel an accepted order before pickup (records who + why).
 *
 * All database access goes through the anon key + the driver's own
 * Auth session (RLS policies in supabase-rls.sql). The service-role
 * key is never used here.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { OrderRow, OrderStatus } from "./orders";

export interface DriverProfile {
  id: string;
  display_name: string;
  phone: string;
  role: "driver" | "admin";
  vehicle_plate: string;
  vehicle_model: string | null;
  is_online: boolean;
  is_active: boolean;
}

export type DriverTargetStatus =
  | "picked_up"
  | "delivered"
  | "completed"
  | "cancelled";

/** Statuses an order can move to from each current status (driver side). */
const ALLOWED_TRANSITIONS: Record<
  OrderStatus,
  DriverTargetStatus[]
> = {
  created: [],
  accepted: ["picked_up", "cancelled"],
  picked_up: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

const STATUS_TIMESTAMP_FIELD: Record<DriverTargetStatus, string> = {
  picked_up: "picked_up_at",
  delivered: "delivered_at",
  completed: "completed_at",
  cancelled: "cancelled_at",
};

/** Sign in with email + password. Returns the user or a plain error. */
export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<{ user: User } | { error: string }> {
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.user) {
    return { error: "Email atau password salah — coba lagi." };
  }
  return { user: data.user };
}

/** Sign out the current session (best effort, never throws). */
export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}

/** The currently signed-in user, or null when signed out. */
export async function getSessionUser(
  client: SupabaseClient,
): Promise<User | null> {
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * The driver (or admin) profile for an auth user id, joined with the
 * drivers row. Returns null when the user has no driver/admin profile
 * yet (account created in Auth but not seeded — see
 * supabase-seed-drivers.sql).
 */
export async function getMyDriverProfile(
  client: SupabaseClient,
  userId: string,
): Promise<DriverProfile | null> {
  const { data, error } = await client
    .from("drivers")
    .select(
      "id, vehicle_plate, vehicle_model, is_online, is_active, profiles (role, display_name, phone)",
    )
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string;
    vehicle_plate: string;
    vehicle_model: string | null;
    is_online: boolean;
    is_active: boolean;
    profiles: { role: string; display_name: string; phone: string } | null;
  };
  if (!row.profiles) return null;
  return {
    id: row.id,
    display_name: row.profiles.display_name,
    phone: row.profiles.phone,
    role: row.profiles.role === "admin" ? "admin" : "driver",
    vehicle_plate: row.vehicle_plate,
    vehicle_model: row.vehicle_model,
    is_online: row.is_online,
    is_active: row.is_active,
  };
}

/** Toggle the driver's online status. Throws a plain-language Error. */
export async function setDriverOnline(
  client: SupabaseClient,
  driverId: string,
  online: boolean,
): Promise<void> {
  const { error } = await client
    .from("drivers")
    .update({ is_online: online })
    .eq("id", driverId);
  if (error) {
    throw new Error(`Gagal mengubah status online: ${error.message}`);
  }
}

/**
 * Save the driver's current GPS position (best effort, called when
 * going online). Throws a plain-language Error on failure.
 */
export async function setDriverLocation(
  client: SupabaseClient,
  driverId: string,
  lat: number,
  lng: number,
): Promise<void> {
  const { error } = await client
    .from("drivers")
    .update({
      current_lat: lat,
      current_lng: lng,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", driverId);
  if (error) {
    throw new Error(`Gagal menyimpan lokasi: ${error.message}`);
  }
}

/** All `created` orders, oldest first (fair dispatch). Throws on error. */
export async function listCreatedOrders(
  client: SupabaseClient,
): Promise<OrderRow[]> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("status", "created")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Gagal memuat order baru: ${error.message}`);
  }
  return (data ?? []) as OrderRow[];
}

/**
 * The driver's one active order (accepted / picked_up / delivered),
 * newest first. Returns null when the driver has no active order.
 */
export async function getMyActiveOrder(
  client: SupabaseClient,
  driverId: string,
): Promise<OrderRow | null> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("driver_id", driverId)
    .in("status", ["accepted", "picked_up", "delivered"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Gagal memuat order aktif: ${error.message}`);
  }
  return (data as OrderRow | null) ?? null;
}

export type AcceptResult =
  | { ok: true }
  | {
      ok: false;
      reason: "taken" | "error";
      message: string;
    };

/**
 * Accept an order with the atomic first-accept guard: the UPDATE only
 * changes the row when it is still `created`. When two drivers accept
 * at the same time, the database lets exactly one through; the other
 * gets 0 rows back and sees "sudah diambil driver lain".
 */
export async function acceptOrder(
  client: SupabaseClient,
  orderId: string,
  driverId: string,
): Promise<AcceptResult> {
  const { data, error } = await client
    .from("orders")
    .update({
      driver_id: driverId,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "created")
    .select("id");
  if (error) {
    return {
      ok: false,
      reason: "error",
      message: `Gagal menerima order: ${error.message}`,
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: "taken",
      message: "Order ini sudah diambil driver lain.",
    };
  }
  return { ok: true };
}

export type AdvanceResult =
  | { ok: true }
  | {
      ok: false;
      reason: "stale" | "invalid-food-price" | "invalid-transition" | "error";
      message: string;
    };

/**
 * Move the driver's active order one step forward, guarded by the
 * current status (a stale phone cannot skip a step or act on an order
 * that already changed).
 *
 * - accepted → picked_up: for food orders `foodPriceIdr` (rupiah yang
 *   dibayar di warung) is required and must be a positive integer.
 * - accepted → cancelled: driver cancels before pickup; `cancelReason`
 *   is recorded (default "Dibatalkan driver").
 * - picked_up → delivered, delivered → completed (cash received).
 */
export async function advanceOrder(
  client: SupabaseClient,
  order: OrderRow,
  driverId: string,
  to: DriverTargetStatus,
  extra?: { foodPriceIdr?: number; cancelReason?: string },
): Promise<AdvanceResult> {
  const from = order.status;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    return {
      ok: false,
      reason: "invalid-transition",
      message: `Order ${from} tidak bisa diubah ke ${to}.`,
    };
  }
  if (
    to === "picked_up" &&
    order.service === "food" &&
    (typeof extra?.foodPriceIdr !== "number" ||
      !Number.isInteger(extra.foodPriceIdr) ||
      extra.foodPriceIdr <= 0)
  ) {
    return {
      ok: false,
      reason: "invalid-food-price",
      message:
        "Isi harga makanan yang dibayar di warung (angka rupiah, lebih dari 0).",
    };
  }

  const patch: Record<string, unknown> = {
    status: to,
    [STATUS_TIMESTAMP_FIELD[to]]: new Date().toISOString(),
  };
  if (to === "picked_up" && order.service === "food") {
    patch.food_price_idr = extra?.foodPriceIdr;
  }
  if (to === "cancelled") {
    patch.cancel_reason = extra?.cancelReason?.trim()
      ? extra.cancelReason.trim()
      : "Dibatalkan driver";
    patch.cancelled_by = "driver";
  }

  const { data, error } = await client
    .from("orders")
    .update(patch)
    .eq("id", order.id)
    .eq("driver_id", driverId)
    .eq("status", from)
    .select("id");
  if (error) {
    return {
      ok: false,
      reason: "error",
      message: `Gagal mengubah status: ${error.message}`,
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: "stale",
      message: "Status order sudah berubah — muat ulang daftar order.",
    };
  }
  return { ok: true };
}

export interface NavigateUrls {
  /** Google Maps directions link to the pickup point. */
  pickupGoogleMaps: string;
  /** Google Maps directions link to the destination. */
  dropoffGoogleMaps: string;
  /** geo: URI for the pickup point (opens the phone's maps app). */
  pickupGeo: string;
  /** geo: URI for the destination. */
  dropoffGeo: string;
}

/**
 * External navigation links for an order (no in-app turn-by-turn in v1
 * — the driver taps a link and the phone's maps app takes over).
 */
export function navigateUrls(
  order: Pick<
    OrderRow,
    | "pickup_lat"
    | "pickup_lng"
    | "dropoff_lat"
    | "dropoff_lng"
    | "pickup_address"
    | "dropoff_address"
  >,
): NavigateUrls {
  return {
    pickupGoogleMaps: `https://www.google.com/maps/dir/?api=1&destination=${order.pickup_lat},${order.pickup_lng}`,
    dropoffGoogleMaps: `https://www.google.com/maps/dir/?api=1&destination=${order.dropoff_lat},${order.dropoff_lng}`,
    pickupGeo: `geo:${order.pickup_lat},${order.pickup_lng}?q=${encodeURIComponent(order.pickup_address)}`,
    dropoffGeo: `geo:${order.dropoff_lat},${order.dropoff_lng}?q=${encodeURIComponent(order.dropoff_address)}`,
  };
}
