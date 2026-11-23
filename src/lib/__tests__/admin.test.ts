import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrderTimeline,
  listAllDrivers,
  listAllOrders,
  setDriverActive,
  updateTariff,
  validateTariffInput,
} from "../admin";
import {
  calculateFareWithTariff,
  createOrder,
  defaultTariff,
  type OrderInput,
  type OrderRow,
  type TariffRow,
} from "../orders";

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    service: "ride",
    status: "created",
    passenger_name: "Budi",
    passenger_phone: "+6281234567890",
    pickup_address: "Alun-Alun Nganjuk",
    pickup_lat: -7.6024,
    pickup_lng: 111.901,
    dropoff_address: "Stasiun Kertosono",
    dropoff_lat: -7.592,
    dropoff_lng: 112.101,
    distance_km: 22.1,
    fare_idr: 6000,
    food_details: null,
    food_price_idr: null,
    driver_id: null,
    created_at: "2026-11-23T04:00:00.000Z",
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

interface CallRecord {
  table: string;
  op: "select" | "insert" | "update";
  row?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  filters?: Array<[string, unknown]>;
}

interface FakeOpts {
  orders?: Array<Record<string, unknown>>;
  ordersError?: string | null;
  drivers?: Array<Record<string, unknown>>;
  driversError?: string | null;
  /** Mutable "database" tariff row — tests may change it between calls. */
  tariff?: TariffRow | null;
  updateError?: string | null;
}

/**
 * Chainable fake query builder (supabase-js style): select/eq/order/
 * insert/update/single all return `this`, and the builder is thenable
 * so `await builder` resolves like a real query.
 */
class FakeBuilder {
  private filters: Array<[string, unknown]> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private insertRow: Record<string, unknown> | null = null;
  private updatePatch: Record<string, unknown> | null = null;
  private isSingle = false;

  constructor(
    private opts: FakeOpts,
    private table: string,
    private calls: CallRecord[],
    private inserted: Array<Record<string, unknown>>,
  ) {}

  select(): this {
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }

  order(col: string, o?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: o?.ascending ?? true };
    return this;
  }

  insert(row: Record<string, unknown>): this {
    this.insertRow = row;
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.updatePatch = patch;
    return this;
  }

  single(): this {
    this.isSingle = true;
    return this;
  }

  then(
    resolve: (v: { data: unknown; error: unknown }) => void,
    _reject: (e: unknown) => void,
  ): void {
    resolve(this.resolve());
  }

  private resolve(): { data: unknown; error: unknown } {
    if (this.insertRow) {
      this.inserted.push(this.insertRow);
      this.calls.push({
        table: this.table,
        op: "insert",
        row: this.insertRow,
      });
      return { data: { id: `order-${this.inserted.length}` }, error: null };
    }
    if (this.updatePatch) {
      this.calls.push({
        table: this.table,
        op: "update",
        patch: this.updatePatch,
        filters: this.filters,
      });
      if (this.opts.updateError) {
        return { data: null, error: { message: this.opts.updateError } };
      }
      if (this.table === "tariffs" && this.isSingle) {
        // The "database" row changes, like a real UPDATE would.
        if (this.opts.tariff) {
          this.opts.tariff = {
            ...this.opts.tariff,
            base_fare_idr: this.updatePatch.base_fare_idr as number,
            base_distance_km: this.updatePatch.base_distance_km as number,
            per_km_idr: this.updatePatch.per_km_idr as number,
          };
        }
        return { data: this.opts.tariff, error: null };
      }
      return { data: null, error: null };
    }
    this.calls.push({ table: this.table, op: "select", filters: this.filters });
    if (this.table === "tariffs") {
      return this.opts.tariff
        ? { data: this.opts.tariff, error: null }
        : { data: null, error: { message: "not found" } };
    }
    if (this.table === "orders") {
      if (this.opts.ordersError) {
        return { data: null, error: { message: this.opts.ordersError } };
      }
      let rows = [...(this.opts.orders ?? [])];
      for (const [col, val] of this.filters) {
        rows = rows.filter((r) => r[col] === val);
      }
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows.sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      return { data: rows, error: null };
    }
    if (this.table === "drivers") {
      if (this.opts.driversError) {
        return { data: null, error: { message: this.opts.driversError } };
      }
      return { data: this.opts.drivers ?? [], error: null };
    }
    return { data: [], error: null };
  }
}

function makeFakeClient(opts: FakeOpts = {}) {
  const calls: CallRecord[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => new FakeBuilder(opts, table, calls, inserted),
  };
  return {
    client: client as unknown as SupabaseClient,
    calls,
    inserted,
    opts,
  };
}

function validOrderInput(overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    service: "ride",
    passengerName: "Budi",
    passengerPhone: "0812 3456 7890",
    pickup: {
      address: "Alun-Alun Nganjuk",
      point: { lat: -7.6024, lng: 111.901 },
    },
    dropoff: {
      address: "Stasiun Kertosono",
      point: { lat: -7.592, lng: 112.101 },
    },
    distanceKm: 5,
    ...overrides,
  };
}

describe("getOrderTimeline", () => {
  it("shows all five steps done for a completed order", () => {
    const timeline = getOrderTimeline(
      orderRow({
        status: "completed",
        accepted_at: "2026-11-23T04:05:00.000Z",
        picked_up_at: "2026-11-23T04:10:00.000Z",
        delivered_at: "2026-11-23T04:30:00.000Z",
        completed_at: "2026-11-23T04:31:00.000Z",
      }),
    );
    expect(timeline).toHaveLength(5);
    expect(timeline.map((t) => t.key)).toEqual([
      "created",
      "accepted",
      "picked_up",
      "delivered",
      "completed",
    ]);
    expect(timeline.every((t) => t.done)).toBe(true);
    expect(timeline[0].at).toBe("2026-11-23T04:00:00.000Z");
    expect(timeline[4].at).toBe("2026-11-23T04:31:00.000Z");
  });

  it("marks later steps pending for a created order", () => {
    const timeline = getOrderTimeline(orderRow({ status: "created" }));
    expect(timeline).toHaveLength(5);
    expect(timeline[0].done).toBe(true);
    expect(timeline.slice(1).every((t) => !t.done && t.at === null)).toBe(
      true,
    );
  });

  it("appends a cancelled entry with who + reason", () => {
    const timeline = getOrderTimeline(
      orderRow({
        status: "cancelled",
        accepted_at: "2026-11-23T04:05:00.000Z",
        cancelled_at: "2026-11-23T04:06:00.000Z",
        cancelled_by: "driver",
        cancel_reason: "Motor mogok",
      }),
    );
    expect(timeline).toHaveLength(6);
    const last = timeline[5];
    expect(last.key).toBe("cancelled");
    expect(last.done).toBe(true);
    expect(last.label).toMatch(/driver/);
    expect(last.label).toMatch(/Motor mogok/);
    // Steps after the accept never happened.
    expect(timeline[2].done).toBe(false);
    expect(timeline[3].done).toBe(false);
  });

  it("uses the food label for the picked_up step on food orders", () => {
    const timeline = getOrderTimeline(
      orderRow({
        service: "food",
        status: "picked_up",
        accepted_at: "2026-11-23T04:05:00.000Z",
        picked_up_at: "2026-11-23T04:10:00.000Z",
      }),
    );
    expect(timeline[2].label).toMatch(/warung/);
  });
});

describe("validateTariffInput", () => {
  it("accepts a valid tariff", () => {
    expect(
      validateTariffInput({
        baseFareIdr: 6000,
        baseDistanceKm: 2,
        perKmIdr: 3500,
      }),
    ).toEqual({});
  });

  it("rejects a zero, negative, fractional, or huge base fare", () => {
    const base = { baseDistanceKm: 2, perKmIdr: 3500 };
    expect(
      validateTariffInput({ ...base, baseFareIdr: 0 }).baseFareIdr,
    ).toBeDefined();
    expect(
      validateTariffInput({ ...base, baseFareIdr: -100 }).baseFareIdr,
    ).toBeDefined();
    expect(
      validateTariffInput({ ...base, baseFareIdr: 6000.5 }).baseFareIdr,
    ).toBeDefined();
    expect(
      validateTariffInput({ ...base, baseFareIdr: 2_000_000 }).baseFareIdr,
    ).toBeDefined();
  });

  it("rejects a negative, huge, or NaN included distance", () => {
    const base = { baseFareIdr: 6000, perKmIdr: 3500 };
    expect(
      validateTariffInput({ ...base, baseDistanceKm: -1 }).baseDistanceKm,
    ).toBeDefined();
    expect(
      validateTariffInput({ ...base, baseDistanceKm: 101 }).baseDistanceKm,
    ).toBeDefined();
    expect(
      validateTariffInput({ ...base, baseDistanceKm: NaN }).baseDistanceKm,
    ).toBeDefined();
  });

  it("rejects a zero or negative per-km rate", () => {
    const base = { baseFareIdr: 6000, baseDistanceKm: 2 };
    expect(
      validateTariffInput({ ...base, perKmIdr: 0 }).perKmIdr,
    ).toBeDefined();
    expect(
      validateTariffInput({ ...base, perKmIdr: -500 }).perKmIdr,
    ).toBeDefined();
  });
});

describe("updateTariff", () => {
  it("writes the new values to the tariffs row (id = 1)", async () => {
    const { client, calls, opts } = makeFakeClient({
      tariff: defaultTariff(),
    });
    const updated = await updateTariff(client, {
      baseFareIdr: 10000,
      baseDistanceKm: 3,
      perKmIdr: 2000,
    });
    expect(updated).toEqual({
      id: 1,
      base_fare_idr: 10000,
      base_distance_km: 3,
      per_km_idr: 2000,
    });
    const updateCall = calls.find((c) => c.op === "update");
    expect(updateCall?.table).toBe("tariffs");
    expect(updateCall?.filters).toContainEqual(["id", 1]);
    expect(updateCall?.patch?.base_fare_idr).toBe(10000);
    // The "database" row itself changed too.
    expect(opts.tariff?.base_fare_idr).toBe(10000);
  });

  it("throws the validation message and writes nothing on bad input", async () => {
    const { client, calls } = makeFakeClient({ tariff: defaultTariff() });
    await expect(
      updateTariff(client, {
        baseFareIdr: 0,
        baseDistanceKm: 2,
        perKmIdr: 3500,
      }),
    ).rejects.toThrow("Tarif dasar");
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("throws a plain-language error when the update fails", async () => {
    const { client } = makeFakeClient({
      tariff: defaultTariff(),
      updateError: "row-level security",
    });
    await expect(
      updateTariff(client, {
        baseFareIdr: 7000,
        baseDistanceKm: 2,
        perKmIdr: 3500,
      }),
    ).rejects.toThrow("Gagal menyimpan tarif");
  });
});

describe("listAllOrders", () => {
  // Rows use the real join shape: driver.profiles (see getOrderById).
  const rows: Array<Record<string, unknown>> = [
    { ...orderRow({ id: "order-old", created_at: "2026-11-21T04:00:00.000Z" }) },
    {
      ...orderRow({
        id: "order-new",
        service: "food",
        status: "completed",
        created_at: "2026-11-23T04:00:00.000Z",
      }),
      driver: {
        profiles: { display_name: "Budi", phone: "+6281234567801" },
      },
    },
    {
      ...orderRow({
        id: "order-mid",
        service: "parcel",
        created_at: "2026-11-22T04:00:00.000Z",
      }),
    },
  ];

  it("returns all orders newest first with the driver joined in", async () => {
    const { client } = makeFakeClient({ orders: rows });
    const result = await listAllOrders(client);
    expect(result.map((r) => r.id)).toEqual([
      "order-new",
      "order-mid",
      "order-old",
    ]);
    expect(result[0].driver).toEqual({
      display_name: "Budi",
      phone: "+6281234567801",
    });
  });

  it("filters by status and by service", async () => {
    const { client } = makeFakeClient({ orders: rows });
    const completed = await listAllOrders(client, { status: "completed" });
    expect(completed.map((r) => r.id)).toEqual(["order-new"]);
    const food = await listAllOrders(client, { service: "food" });
    expect(food.map((r) => r.id)).toEqual(["order-new"]);
    const none = await listAllOrders(client, {
      status: "cancelled",
      service: "food",
    });
    expect(none).toEqual([]);
  });

  it("throws a plain-language error when the query fails", async () => {
    const { client } = makeFakeClient({ ordersError: "boom" });
    await expect(listAllOrders(client)).rejects.toThrow("Gagal memuat order");
  });
});

describe("listAllDrivers", () => {
  it("returns drivers sorted by name with profile flattened", async () => {
    const { client } = makeFakeClient({
      drivers: [
        {
          id: "driver-2",
          vehicle_plate: "AE 5678 EE",
          vehicle_model: "Yamaha Mio",
          is_online: false,
          is_active: true,
          last_seen_at: null,
          profiles: { display_name: "Slamet", phone: "+6281234567802" },
        },
        {
          id: "driver-1",
          vehicle_plate: "AE 1234 AA",
          vehicle_model: "Honda Beat",
          is_online: true,
          is_active: true,
          last_seen_at: "2026-11-23T04:00:00.000Z",
          profiles: { display_name: "Budi", phone: "+6281234567801" },
        },
      ],
    });
    const result = await listAllDrivers(client);
    expect(result.map((d) => d.display_name)).toEqual(["Budi", "Slamet"]);
    expect(result[0]).toMatchObject({
      id: "driver-1",
      vehicle_plate: "AE 1234 AA",
      is_online: true,
      is_active: true,
    });
  });

  it("throws a plain-language error when the query fails", async () => {
    const { client } = makeFakeClient({ driversError: "boom" });
    await expect(listAllDrivers(client)).rejects.toThrow(
      "Gagal memuat driver",
    );
  });
});

describe("setDriverActive", () => {
  it("updates is_active for the given driver", async () => {
    const { client, calls } = makeFakeClient();
    await setDriverActive(client, "driver-1", false);
    const updateCall = calls.find((c) => c.op === "update");
    expect(updateCall?.table).toBe("drivers");
    expect(updateCall?.patch).toEqual({ is_active: false });
    expect(updateCall?.filters).toContainEqual(["id", "driver-1"]);
  });

  it("throws a plain-language error when the update fails", async () => {
    const { client } = makeFakeClient({ updateError: "row-level security" });
    await expect(setDriverActive(client, "driver-1", false)).rejects.toThrow(
      "Gagal mengubah status driver",
    );
  });
});

describe("tariff change rule (task 16)", () => {
  it("a new tariff changes the fare only for orders created after it", async () => {
    const oldTariff = defaultTariff(); // 6000 / 2 km / 3500
    const { client, inserted, opts } = makeFakeClient({ tariff: oldTariff });

    // Order 1 under the old tariff: 5 km → 6000 + 3 × 3500 = 16500.
    await createOrder(client, validOrderInput({ distanceKm: 5 }));
    expect(inserted[0].fare_idr).toBe(16500);
    expect(calculateFareWithTariff(5, oldTariff)).toBe(16500);

    // Admin changes the tariff: 10000 / 3 km / 2000.
    await updateTariff(client, {
      baseFareIdr: 10000,
      baseDistanceKm: 3,
      perKmIdr: 2000,
    });
    expect(opts.tariff).toEqual({
      id: 1,
      base_fare_idr: 10000,
      base_distance_km: 3,
      per_km_idr: 2000,
    });

    // Order 2 under the new tariff: 5 km → 10000 + 2 × 2000 = 14000.
    await createOrder(client, validOrderInput({ distanceKm: 5 }));
    expect(inserted[1].fare_idr).toBe(14000);

    // Order 1 keeps its stored fare — it is never re-fared.
    expect(inserted[0].fare_idr).toBe(16500);
  });

  it("the pure fare function agrees with the stored fares", () => {
    expect(
      calculateFareWithTariff(
        5,
        { id: 1, base_fare_idr: 6000, base_distance_km: 2, per_km_idr: 3500 },
      ),
    ).toBe(16500);
    expect(
      calculateFareWithTariff(
        5,
        { id: 1, base_fare_idr: 10000, base_distance_km: 3, per_km_idr: 2000 },
      ),
    ).toBe(14000);
  });
});
