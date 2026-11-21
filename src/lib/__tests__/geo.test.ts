import { describe, expect, it } from "vitest";
import {
  MADIUN_BOUNDS,
  formatDistance,
  haversineKm,
  haversineMeters,
  isInsideMadiun,
  type LatLng,
} from "../geo";

/**
 * Reference points in/around Madiun (approximate public coordinates).
 * Distance assertions use wide ranges because these are approximate.
 */
const ALUN_ALUN_MADIUN: LatLng = { lat: -7.6298, lng: 111.5235 };
const STASIUN_MADIUN: LatLng = { lat: -7.6219, lng: 111.5153 };
const SURABAYA: LatLng = { lat: -7.2575, lng: 112.7521 };
const PONOROGO: LatLng = { lat: -7.8667, lng: 111.4667 };
const NGAWI: LatLng = { lat: -7.4083, lng: 111.4455 };

describe("MADIUN_BOUNDS", () => {
  it("is the operator-agreed initial box lat [-7.70, -7.55], lng [111.45, 111.60]", () => {
    expect(MADIUN_BOUNDS).toEqual({
      minLat: -7.7,
      maxLat: -7.55,
      minLng: 111.45,
      maxLng: 111.6,
    });
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(ALUN_ALUN_MADIUN, ALUN_ALUN_MADIUN)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineKm(ALUN_ALUN_MADIUN, STASIUN_MADIUN)).toBeCloseTo(
      haversineKm(STASIUN_MADIUN, ALUN_ALUN_MADIUN),
      10,
    );
  });

  it("matches the known 1-degree-of-latitude distance (~111.19 km)", () => {
    expect(
      haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }),
    ).toBeCloseTo(111.19, 0);
  });

  it("Alun-Alun Madiun → Stasiun Madiun is about 1.3 km", () => {
    const km = haversineKm(ALUN_ALUN_MADIUN, STASIUN_MADIUN);
    expect(km).toBeGreaterThan(1.1);
    expect(km).toBeLessThan(1.4);
  });

  it("Alun-Alun Madiun → Surabaya is about 145 km", () => {
    const km = haversineKm(ALUN_ALUN_MADIUN, SURABAYA);
    expect(km).toBeGreaterThan(140);
    expect(km).toBeLessThan(150);
  });

  it("throws on invalid coordinates", () => {
    expect(() =>
      haversineKm({ lat: Number.NaN, lng: 111 }, ALUN_ALUN_MADIUN),
    ).toThrow(RangeError);
    expect(() =>
      haversineKm({ lat: -91, lng: 111 }, ALUN_ALUN_MADIUN),
    ).toThrow(RangeError);
    expect(() =>
      haversineKm({ lat: -7.6, lng: 181 }, ALUN_ALUN_MADIUN),
    ).toThrow(RangeError);
  });
});

describe("haversineMeters", () => {
  it("is haversineKm × 1000", () => {
    expect(haversineMeters(ALUN_ALUN_MADIUN, STASIUN_MADIUN)).toBeCloseTo(
      haversineKm(ALUN_ALUN_MADIUN, STASIUN_MADIUN) * 1000,
      6,
    );
  });
});

describe("isInsideMadiun", () => {
  it("accepts points inside Kota Madiun", () => {
    expect(isInsideMadiun(ALUN_ALUN_MADIUN)).toBe(true);
    expect(isInsideMadiun(STASIUN_MADIUN)).toBe(true);
  });

  it("rejects Surabaya, Ponorogo, and Ngawi", () => {
    expect(isInsideMadiun(SURABAYA)).toBe(false);
    expect(isInsideMadiun(PONOROGO)).toBe(false);
    expect(isInsideMadiun(NGAWI)).toBe(false);
  });

  it("includes the box edges", () => {
    expect(isInsideMadiun({ lat: -7.7, lng: 111.45 })).toBe(true);
    expect(isInsideMadiun({ lat: -7.55, lng: 111.6 })).toBe(true);
  });

  it("rejects just outside the box", () => {
    expect(isInsideMadiun({ lat: -7.701, lng: 111.5 })).toBe(false);
    expect(isInsideMadiun({ lat: -7.6, lng: 111.449 })).toBe(false);
  });
});

describe("formatDistance", () => {
  it("formats under 1 km in metres", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(0.85)).toBe("850 m");
  });

  it("formats 1 km and over with one decimal and a comma", () => {
    expect(formatDistance(1)).toBe("1,0 km");
    expect(formatDistance(1.26)).toBe("1,3 km");
    expect(formatDistance(5)).toBe("5,0 km");
  });

  it("throws on invalid input", () => {
    expect(() => formatDistance(-1)).toThrow(RangeError);
    expect(() => formatDistance(Number.NaN)).toThrow(RangeError);
    expect(() => formatDistance(Infinity)).toThrow(RangeError);
  });
});
