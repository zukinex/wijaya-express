import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateFareWithTariff,
  createOrder,
  defaultTariff,
  getTariff,
  normalizePhone,
  validateOrderInput,
  type OrderInput,
  type TariffRow,
} from "../orders";
import type { LatLng } from "../geo";

const ALUN_ALUN: LatLng = { lat: -7.6298, lng: 111.5235 };
const STASIUN: LatLng = { lat: -7.6219, lng: 111.5153 };

function validInput(overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    service: "ride",
    passengerName: "Budi",
    passengerPhone: "0812 3456 7890",
    pickup: { address: "Alun-Alun Madiun", point: ALUN_ALUN },
    dropoff: { address: "Stasiun Madiun", point: STASIUN },
    distanceKm: 1.3,
    ...overrides,
  };
}

describe("normalizePhone", () => {
  it("normalizes 08..., +62..., 62..., and 8... forms", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizePhone("+62 812 3456 7890")).toBe("+6281234567890");
    expect(normalizePhone("6281234567890")).toBe("+6281234567890");
    expect(normalizePhone("81234567890")).toBe("+6281234567890");
  });

  it("rejects too-short, non-mobile, and garbage numbers", () => {
    expect(normalizePhone("0812")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("021 555 1234")).toBeNull(); // landline (021)
    expect(normalizePhone("")).toBeNull();
  });
});

describe("validateOrderInput", () => {
  it("accepts a valid ride order", () => {
    expect(validateOrderInput(validInput())).toEqual({});
  });

  it("rejects a missing/short name", () => {
    expect(validateOrderInput(validInput({ passengerName: " " })).passengerName).toBeDefined();
    expect(validateOrderInput(validInput({ passengerName: "A" })).passengerName).toBeDefined();
  });

  it("rejects an invalid phone", () => {
    expect(
      validateOrderInput(validInput({ passengerPhone: "12345" })).passengerPhone,
    ).toBeDefined();
  });

  it("rejects points outside Madiun", () => {
    const surabaya: LatLng = { lat: -7.2575, lng: 112.7521 };
    expect(
      validateOrderInput(
        validInput({ dropoff: { address: "Surabaya", point: surabaya } }),
      ).dropoff,
    ).toMatch(/luar area/);
  });

  it("requires food details for food orders", () => {
    const errors = validateOrderInput(
      validInput({ service: "food" }),
    );
    expect(errors.foodWarung).toBeDefined();
    expect(errors.foodOrder).toBeDefined();
    expect(
      validateOrderInput(
        validInput({
          service: "food",
          foodWarung: "Warung Bu Tini",
          foodOrder: "Nasi pecel 2",
        }),
      ),
    ).toEqual({});
  });

  it("rejects a zero distance (same pickup and destination)", () => {
    expect(
      validateOrderInput(
        validInput({
          dropoff: { address: "Alun-Alun Madiun", point: ALUN_ALUN },
          distanceKm: 0,
        }),
      ).distance,
    ).toBeDefined();
  });
});

describe("calculateFareWithTariff", () => {
  it("uses the tariffs row values", () => {
    const tariff: TariffRow = {
      id: 1,
      base_fare_idr: 10000,
      base_distance_km: 3,
      per_km_idr: 2000,
    };
    expect(calculateFareWithTariff(2, tariff)).toBe(10000);
    expect(calculateFareWithTariff(5, tariff)).toBe(14000);
  });

  it("matches the launch defaults", () => {
    expect(calculateFareWithTariff(5, defaultTariff())).toBe(16500);
    expect(calculateFareWithTariff(2, defaultTariff())).toBe(6000);
  });
});

interface FakeClientOpts {
  tariff?: TariffRow | null;
  insertError?: string | null;
  insertedId?: string;
}

function makeFakeClient(opts: FakeClientOpts = {}) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => {
      if (table === "tariffs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                opts.tariff
                  ? { data: opts.tariff, error: null }
                  : { data: null, error: { message: "not found" } },
            }),
          }),
        };
      }
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () =>
                opts.insertError
                  ? { data: null, error: { message: opts.insertError } }
                  : {
                      data: { id: opts.insertedId ?? "order-123" },
                      error: null,
                    },
            }),
          };
        },
      };
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    inserted,
  };
}

describe("getTariff", () => {
  it("returns the tariffs row", async () => {
    const { client } = makeFakeClient({ tariff: defaultTariff() });
    await expect(getTariff(client)).resolves.toEqual(defaultTariff());
  });

  it("returns null when the row cannot be read", async () => {
    const { client } = makeFakeClient({ tariff: null });
    await expect(getTariff(client)).resolves.toBeNull();
  });
});

describe("createOrder", () => {
  it("inserts the order with the tariff fare and normalized phone", async () => {
    const { client, inserted } = makeFakeClient({
      tariff: defaultTariff(),
      insertedId: "order-abc",
    });
    const result = await createOrder(
      client,
      validInput({ distanceKm: 5, passengerPhone: "0812-3456-7890" }),
    );
    expect(result).toEqual({ id: "order-abc" });
    expect(inserted).toHaveLength(1);
    const row = inserted[0] as Record<string, unknown>;
    expect(row.service).toBe("ride");
    expect(row.status).toBe("created");
    expect(row.fare_idr).toBe(16500);
    expect(row.passenger_phone).toBe("+6281234567890");
    expect(row.distance_km).toBe(5);
    expect(row.food_details).toBeNull();
  });

  it("stores food details as warung + order text", async () => {
    const { client, inserted } = makeFakeClient({ tariff: defaultTariff() });
    await createOrder(
      client,
      validInput({
        service: "food",
        foodWarung: "Warung Bu Tini",
        foodOrder: "Nasi pecel 2, es teh 1",
      }),
    );
    const row = inserted[0] as Record<string, unknown>;
    expect(row.food_details).toBe(
      "Warung: Warung Bu Tini\nPesanan: Nasi pecel 2, es teh 1",
    );
  });

  it("falls back to the launch-default tariff when the row cannot be read", async () => {
    const { client, inserted } = makeFakeClient({ tariff: null });
    await createOrder(client, validInput({ distanceKm: 5 }));
    expect((inserted[0] as Record<string, unknown>).fare_idr).toBe(16500);
  });

  it("throws a plain-language error on invalid input", async () => {
    const { client } = makeFakeClient({ tariff: defaultTariff() });
    await expect(
      createOrder(client, validInput({ passengerName: "" })),
    ).rejects.toThrow("nama penumpang");
  });

  it("throws a plain-language error when the insert fails", async () => {
    const { client } = makeFakeClient({ insertError: "row-level security" });
    await expect(createOrder(client, validInput())).rejects.toThrow(
      "Gagal membuat pesanan",
    );
  });
});
