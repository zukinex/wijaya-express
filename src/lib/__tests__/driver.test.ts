import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acceptOrder,
  advanceOrder,
  getMyActiveOrder,
  getMyDriverProfile,
  getSessionUser,
  listCreatedOrders,
  navigateUrls,
  setDriverLocation,
  setDriverOnline,
  signInWithPassword,
  signOut,
  type DriverProfile,
} from "../driver";
import type { OrderRow } from "../orders";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

interface CallRecord {
  table: string;
  method: string;
  args: unknown;
}

interface FakeOpts {
  authUser?: { id: string; email: string } | null;
  signInError?: string | null;
  sessionUser?: { id: string; email: string } | null;
  driverProfileRow?: Record<string, unknown> | null;
  driverProfileError?: string | null;
  selectResult?: QueryResult;
  maybeSingleResult?: QueryResult;
  updateResult?: QueryResult;
  updateError?: string | null;
}

class FakeBuilder {
  private mode: "select" | "update" = "select";
  private patch: Record<string, unknown> | null = null;

  constructor(
    private opts: FakeOpts,
    private table: string,
    private calls: CallRecord[],
  ) {}

  select(...args: unknown[]) {
    this.calls.push({ table: this.table, method: "select", args });
    return this;
  }
  eq(...args: unknown[]) {
    this.calls.push({ table: this.table, method: "eq", args });
    return this;
  }
  in(...args: unknown[]) {
    this.calls.push({ table: this.table, method: "in", args });
    return this;
  }
  order(...args: unknown[]) {
    this.calls.push({ table: this.table, method: "order", args });
    return this;
  }
  limit(...args: unknown[]) {
    this.calls.push({ table: this.table, method: "limit", args });
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.mode = "update";
    this.patch = patch;
    this.calls.push({ table: this.table, method: "update", args: patch });
    return this;
  }
  single(): Promise<QueryResult> {
    return Promise.resolve(this.resolve());
  }
  maybeSingle(): Promise<QueryResult> {
    return Promise.resolve(
      this.opts.maybeSingleResult ?? this.resolve(),
    );
  }
  then(
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) {
    return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
  }

  private resolve(): QueryResult {
    if (this.mode === "update") {
      if (this.opts.updateError) {
        return { data: null, error: { message: this.opts.updateError } };
      }
      return (
        this.opts.updateResult ?? { data: [{ id: "order-1" }], error: null }
      );
    }
    if (this.table === "drivers" && this.opts.driverProfileRow !== undefined) {
      return this.opts.driverProfileError
        ? { data: null, error: { message: this.opts.driverProfileError } }
        : { data: this.opts.driverProfileRow, error: null };
    }
    return this.opts.selectResult ?? { data: [], error: null };
  }
}

function makeFakeClient(opts: FakeOpts = {}) {
  const calls: CallRecord[] = [];
  const client = {
    auth: {
      signInWithPassword: async ({
        email,
      }: {
        email: string;
        password: string;
      }) => {
        if (opts.signInError) {
          return { data: { user: null }, error: { message: opts.signInError } };
        }
        return {
          data: { user: opts.authUser ?? { id: "driver-1", email } },
          error: null,
        };
      },
      signOut: async () => ({ error: null }),
      getSession: async () => ({
        data: { session: opts.sessionUser ? { user: opts.sessionUser } : null },
      }),
    },
    from: (table: string) => new FakeBuilder(opts, table, calls),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    service: "ride",
    status: "created",
    passenger_name: "Budi",
    passenger_phone: "+6281234567890",
    pickup_address: "Alun-Alun Nganjuk",
    pickup_lat: -7.6298,
    pickup_lng: 111.5235,
    dropoff_address: "Stasiun Kertosono",
    dropoff_lat: -7.6219,
    dropoff_lng: 111.5153,
    distance_km: 1.3,
    fare_idr: 6000,
    food_details: null,
    food_price_idr: null,
    driver_id: null,
    created_at: "2026-11-21T04:00:00.000Z",
    accepted_at: null,
    picked_up_at: null,
    delivered_at: null,
    completed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    cancelled_by: null,
    ...overrides,
  };
}

function driverProfileRow(): Record<string, unknown> {
  return {
    id: "driver-1",
    vehicle_plate: "AE 1234 AA",
    vehicle_model: "Honda Beat",
    is_online: true,
    is_active: true,
    profiles: {
      role: "driver",
      display_name: "Budi Santoso",
      phone: "+6281234567801",
    },
  };
}

describe("signInWithPassword", () => {
  it("returns the user on success", async () => {
    const { client } = makeFakeClient();
    const result = await signInWithPassword(
      client,
      "driver1@wijayaexpress.test",
      "secret",
    );
    expect("user" in result && result.user.id).toBe("driver-1");
  });

  it("returns a plain-language error on failure", async () => {
    const { client } = makeFakeClient({ signInError: "Invalid login" });
    const result = await signInWithPassword(
      client,
      "driver1@wijayaexpress.test",
      "wrong",
    );
    expect("error" in result && result.error).toMatch(/Email atau password/);
  });
});

describe("getSessionUser", () => {
  it("returns the session user or null", async () => {
    const { client } = makeFakeClient({
      sessionUser: { id: "driver-1", email: "d@test" },
    });
    expect((await getSessionUser(client))?.id).toBe("driver-1");
    const { client: client2 } = makeFakeClient({ sessionUser: null });
    expect(await getSessionUser(client2)).toBeNull();
  });
});

describe("signOut", () => {
  it("does not throw", async () => {
    const { client } = makeFakeClient();
    await expect(signOut(client)).resolves.toBeUndefined();
  });
});

describe("getMyDriverProfile", () => {
  it("flattens the drivers + profiles join", async () => {
    const { client } = makeFakeClient({
      driverProfileRow: driverProfileRow(),
    });
    const profile = await getMyDriverProfile(client, "driver-1");
    expect(profile).toEqual({
      id: "driver-1",
      display_name: "Budi Santoso",
      phone: "+6281234567801",
      role: "driver",
      vehicle_plate: "AE 1234 AA",
      vehicle_model: "Honda Beat",
      is_online: true,
      is_active: true,
    } satisfies DriverProfile);
  });

  it("returns null when the profile row is missing", async () => {
    const { client } = makeFakeClient({ driverProfileRow: null });
    expect(await getMyDriverProfile(client, "driver-1")).toBeNull();
  });
});

describe("setDriverOnline / setDriverLocation", () => {
  it("updates is_online for the driver id", async () => {
    const { client, calls } = makeFakeClient();
    await setDriverOnline(client, "driver-1", false);
    const update = calls.find((c) => c.method === "update");
    expect(update?.args).toEqual({ is_online: false });
    expect(
      calls.some(
        (c) =>
          c.method === "eq" &&
          (c.args as unknown[])[1] === "driver-1",
      ),
    ).toBe(true);
  });

  it("saves lat/lng + last_seen_at", async () => {
    const { client, calls } = makeFakeClient();
    await setDriverLocation(client, "driver-1", -7.63, 111.52);
    const update = calls.find((c) => c.method === "update");
    const patch = update?.args as Record<string, unknown>;
    expect(patch.current_lat).toBe(-7.63);
    expect(patch.current_lng).toBe(111.52);
    expect(typeof patch.last_seen_at).toBe("string");
  });

  it("throws a plain-language error when the update fails", async () => {
    const { client } = makeFakeClient({ updateError: "row-level security" });
    await expect(setDriverOnline(client, "driver-1", true)).rejects.toThrow(
      "Gagal mengubah status online",
    );
  });
});

describe("listCreatedOrders / getMyActiveOrder", () => {
  it("returns created orders", async () => {
    const rows = [orderRow(), orderRow({ id: "order-2" })];
    const { client } = makeFakeClient({
      selectResult: { data: rows, error: null },
    });
    await expect(listCreatedOrders(client)).resolves.toEqual(rows);
  });

  it("throws a plain-language error when the list fails", async () => {
    const { client } = makeFakeClient({
      selectResult: { data: null, error: { message: "boom" } },
    });
    await expect(listCreatedOrders(client)).rejects.toThrow(
      "Gagal memuat order baru",
    );
  });

  it("returns the active order or null", async () => {
    const active = orderRow({ status: "accepted", driver_id: "driver-1" });
    const { client } = makeFakeClient({
      maybeSingleResult: { data: active, error: null },
    });
    await expect(getMyActiveOrder(client, "driver-1")).resolves.toEqual(
      active,
    );
    const { client: client2 } = makeFakeClient({
      maybeSingleResult: { data: null, error: null },
    });
    await expect(getMyActiveOrder(client2, "driver-1")).resolves.toBeNull();
  });
});

describe("acceptOrder", () => {
  it("accepts with the atomic guard (status=created) and returns ok", async () => {
    const { client, calls } = makeFakeClient({
      updateResult: { data: [{ id: "order-1" }], error: null },
    });
    const result = await acceptOrder(client, "order-1", "driver-1");
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.method === "update");
    const patch = update?.args as Record<string, unknown>;
    expect(patch.driver_id).toBe("driver-1");
    expect(patch.status).toBe("accepted");
    expect(typeof patch.accepted_at).toBe("string");
    expect(
      calls.some(
        (c) =>
          c.method === "eq" &&
          (c.args as unknown[])[0] === "status" &&
          (c.args as unknown[])[1] === "created",
      ),
    ).toBe(true);
  });

  it("reports 'taken' when 0 rows come back (lost the race)", async () => {
    const { client } = makeFakeClient({
      updateResult: { data: [], error: null },
    });
    const result = await acceptOrder(client, "order-1", "driver-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("taken");
      expect(result.message).toMatch(/sudah diambil/);
    }
  });

  it("reports an error when the update fails", async () => {
    const { client } = makeFakeClient({ updateError: "row-level security" });
    const result = await acceptOrder(client, "order-1", "driver-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("error");
  });
});

describe("advanceOrder", () => {
  it("moves accepted → picked_up for a ride", async () => {
    const { client, calls } = makeFakeClient();
    const result = await advanceOrder(
      client,
      orderRow({ status: "accepted", driver_id: "driver-1" }),
      "driver-1",
      "picked_up",
    );
    expect(result).toEqual({ ok: true });
    const patch = (
      calls.find((c) => c.method === "update")?.args ?? {}
    ) as Record<string, unknown>;
    expect(patch.status).toBe("picked_up");
    expect(typeof patch.picked_up_at).toBe("string");
  });

  it("requires a food price for food picked_up", async () => {
    const { client, calls } = makeFakeClient();
    const food = orderRow({
      service: "food",
      status: "accepted",
      driver_id: "driver-1",
      food_details: "Warung: Bu Tini\nPesanan: Nasi pecel 2",
    });
    const bad = await advanceOrder(client, food, "driver-1", "picked_up");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("invalid-food-price");
    expect(calls.some((c) => c.method === "update")).toBe(false);

    const good = await advanceOrder(client, food, "driver-1", "picked_up", {
      foodPriceIdr: 25000,
    });
    expect(good).toEqual({ ok: true });
    const patch = (
      calls.find((c) => c.method === "update")?.args ?? {}
    ) as Record<string, unknown>;
    expect(patch.food_price_idr).toBe(25000);
  });

  it("rejects a zero or non-integer food price", async () => {
    const { client } = makeFakeClient();
    const food = orderRow({
      service: "food",
      status: "accepted",
      driver_id: "driver-1",
    });
    for (const price of [0, -5000, 12.5]) {
      const result = await advanceOrder(client, food, "driver-1", "picked_up", {
        foodPriceIdr: price,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("moves picked_up → delivered and delivered → completed", async () => {
    const { client } = makeFakeClient();
    await expect(
      advanceOrder(
        client,
        orderRow({ status: "picked_up", driver_id: "driver-1" }),
        "driver-1",
        "delivered",
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      advanceOrder(
        client,
        orderRow({ status: "delivered", driver_id: "driver-1" }),
        "driver-1",
        "completed",
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("cancels from accepted with reason + cancelled_by driver", async () => {
    const { client, calls } = makeFakeClient();
    const result = await advanceOrder(
      client,
      orderRow({ status: "accepted", driver_id: "driver-1" }),
      "driver-1",
      "cancelled",
      { cancelReason: "Motor mogok" },
    );
    expect(result).toEqual({ ok: true });
    const patch = (
      calls.find((c) => c.method === "update")?.args ?? {}
    ) as Record<string, unknown>;
    expect(patch.status).toBe("cancelled");
    expect(patch.cancel_reason).toBe("Motor mogok");
    expect(patch.cancelled_by).toBe("driver");
    expect(typeof patch.cancelled_at).toBe("string");
  });

  it("rejects invalid transitions without touching the database", async () => {
    const { client, calls } = makeFakeClient();
    const result = await advanceOrder(
      client,
      orderRow({ status: "created" }),
      "driver-1",
      "picked_up",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-transition");
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it("reports 'stale' when 0 rows come back", async () => {
    const { client } = makeFakeClient({
      updateResult: { data: [], error: null },
    });
    const result = await advanceOrder(
      client,
      orderRow({ status: "accepted", driver_id: "driver-1" }),
      "driver-1",
      "picked_up",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale");
  });
});

describe("navigateUrls", () => {
  it("builds Google Maps + geo links for pickup and destination", () => {
    const urls = navigateUrls(orderRow());
    expect(urls.pickupGoogleMaps).toContain(
      "https://www.google.com/maps/dir/?api=1&destination=-7.6298,111.5235",
    );
    expect(urls.dropoffGoogleMaps).toContain("destination=-7.6219,111.5153");
    expect(urls.pickupGeo).toMatch(/^geo:-7\.6298,111\.5235\?q=/);
    expect(urls.pickupGeo).toContain(encodeURIComponent("Alun-Alun Nganjuk"));
  });
});
