import { describe, expect, it } from "vitest";
import {
  BASE_DISTANCE_KM,
  BASE_FARE_IDR,
  PER_KM_IDR,
  calculateFare,
  calculateFareFromMeters,
  formatRupiah,
} from "../fare";

describe("tariff constants", () => {
  it("matches the operator-confirmed tariff (6000 / 2 km / 3500 per km)", () => {
    expect(BASE_FARE_IDR).toBe(6000);
    expect(BASE_DISTANCE_KM).toBe(2);
    expect(PER_KM_IDR).toBe(3500);
  });
});

describe("calculateFare", () => {
  it("charges the base fare for 0 km", () => {
    expect(calculateFare(0)).toBe(6000);
  });

  it("charges the base fare for 1 km", () => {
    expect(calculateFare(1)).toBe(6000);
  });

  it("charges the base fare at exactly 2 km", () => {
    expect(calculateFare(2)).toBe(6000);
  });

  it("charges one extra km for 2.1 km (per started km)", () => {
    expect(calculateFare(2.1)).toBe(9500);
  });

  it("charges 3 extra km for 5 km → 16500 (the spec example)", () => {
    expect(calculateFare(5)).toBe(16500);
  });

  it("charges 8 extra km for 10 km → 34000", () => {
    expect(calculateFare(10)).toBe(34000);
  });

  it("rounds up a fractional km beyond the base distance", () => {
    // 4.01 km → ceil(2.01) = 3 extra km
    expect(calculateFare(4.01)).toBe(6000 + 3 * 3500);
  });

  it("rejects negative distances", () => {
    expect(() => calculateFare(-1)).toThrow(RangeError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => calculateFare(Number.NaN)).toThrow(RangeError);
    expect(() => calculateFare(Infinity)).toThrow(RangeError);
  });
});

describe("calculateFareFromMeters", () => {
  it("converts metres to km before applying the formula", () => {
    expect(calculateFareFromMeters(5000)).toBe(16500);
    expect(calculateFareFromMeters(2000)).toBe(6000);
    expect(calculateFareFromMeters(2100)).toBe(9500);
  });
});

describe("formatRupiah", () => {
  it("formats with Indonesian thousand separators", () => {
    expect(formatRupiah(6000)).toBe("Rp 6.000");
    expect(formatRupiah(16500)).toBe("Rp 16.500");
    expect(formatRupiah(34000)).toBe("Rp 34.000");
    expect(formatRupiah(0)).toBe("Rp 0");
  });

  it("rejects non-integers and negatives", () => {
    expect(() => formatRupiah(1.5)).toThrow(RangeError);
    expect(() => formatRupiah(-100)).toThrow(RangeError);
  });
});
