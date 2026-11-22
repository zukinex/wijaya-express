import { describe, expect, it } from "vitest";
import {
  SERVICE_AREA_BOUNDS,
  formatDistance,
  haversineKm,
  haversineMeters,
  isInsideServiceArea,
  outsideServiceAreaMessage,
  type LatLng,
} from "../geo";

/**
 * Reference points in/around Nganjuk + Jombang (approximate public
 * coordinates, verified against OpenStreetMap/Nominatim 2026-11-22).
 * Distance assertions use wide ranges because these are approximate.
 */
const ALUN_ALUN_NGANJUK: LatLng = { lat: -7.6024, lng: 111.901 };
const STASIUN_KERTOSONO: LatLng = { lat: -7.592, lng: 112.101 };
const JOMBANG: LatLng = { lat: -7.5465, lng: 112.2271 };
const STASIUN_MADIUN: LatLng = { lat: -7.6188, lng: 111.5246 };
const SURABAYA: LatLng = { lat: -7.2575, lng: 112.7521 };
const PONOROGO: LatLng = { lat: -7.8667, lng: 111.4667 };
const NGAWI: LatLng = { lat: -7.4083, lng: 111.4455 };

describe("SERVICE_AREA_BOUNDS", () => {
  it("is the Nganjuk + Jombang box lat [-7.8366, -7.3437], lng [111.7254, 112.4558]", () => {
    expect(SERVICE_AREA_BOUNDS).toEqual({
      minLat: -7.8366,
      maxLat: -7.3437,
      minLng: 111.7254,
      maxLng: 112.4558,
    });
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(ALUN_ALUN_NGANJUK, ALUN_ALUN_NGANJUK)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineKm(ALUN_ALUN_NGANJUK, STASIUN_KERTOSONO)).toBeCloseTo(
      haversineKm(STASIUN_KERTOSONO, ALUN_ALUN_NGANJUK),
      10,
    );
  });

  it("matches the known 1-degree-of-latitude distance (~111.19 km)", () => {
    expect(
      haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }),
    ).toBeCloseTo(111.19, 0);
  });

  it("Alun-Alun Nganjuk → Stasiun Kertosono is about 22 km", () => {
    const km = haversineKm(ALUN_ALUN_NGANJUK, STASIUN_KERTOSONO);
    expect(km).toBeGreaterThan(21);
    expect(km).toBeLessThan(23);
  });

  it("Alun-Alun Nganjuk → Jombang city is about 36 km", () => {
    const km = haversineKm(ALUN_ALUN_NGANJUK, JOMBANG);
    expect(km).toBeGreaterThan(35);
    expect(km).toBeLessThan(38);
  });

  it("Alun-Alun Nganjuk → Surabaya is about 101 km", () => {
    const km = haversineKm(ALUN_ALUN_NGANJUK, SURABAYA);
    expect(km).toBeGreaterThan(99);
    expect(km).toBeLessThan(104);
  });

  it("throws on invalid coordinates", () => {
    expect(() =>
      haversineKm({ lat: Number.NaN, lng: 111 }, ALUN_ALUN_NGANJUK),
    ).toThrow(RangeError);
    expect(() =>
      haversineKm({ lat: -91, lng: 111 }, ALUN_ALUN_NGANJUK),
    ).toThrow(RangeError);
    expect(() =>
      haversineKm({ lat: -7.6, lng: 181 }, ALUN_ALUN_NGANJUK),
    ).toThrow(RangeError);
  });
});

describe("haversineMeters", () => {
  it("is haversineKm × 1000", () => {
    expect(haversineMeters(ALUN_ALUN_NGANJUK, STASIUN_KERTOSONO)).toBeCloseTo(
      haversineKm(ALUN_ALUN_NGANJUK, STASIUN_KERTOSONO) * 1000,
      6,
    );
  });
});

describe("isInsideServiceArea", () => {
  it("accepts points inside Nganjuk and Jombang", () => {
    expect(isInsideServiceArea(ALUN_ALUN_NGANJUK)).toBe(true);
    expect(isInsideServiceArea(STASIUN_KERTOSONO)).toBe(true);
    expect(isInsideServiceArea(JOMBANG)).toBe(true);
  });

  it("rejects Surabaya, Ponorogo, Ngawi, and Stasiun Madiun", () => {
    expect(isInsideServiceArea(SURABAYA)).toBe(false);
    expect(isInsideServiceArea(PONOROGO)).toBe(false);
    expect(isInsideServiceArea(NGAWI)).toBe(false);
    expect(isInsideServiceArea(STASIUN_MADIUN)).toBe(false);
  });

  it("includes the box edges", () => {
    expect(isInsideServiceArea({ lat: -7.8366, lng: 111.7254 })).toBe(true);
    expect(isInsideServiceArea({ lat: -7.3437, lng: 112.4558 })).toBe(true);
  });

  it("rejects just outside the box", () => {
    expect(isInsideServiceArea({ lat: -7.8367, lng: 111.9 })).toBe(false);
    expect(isInsideServiceArea({ lat: -7.6, lng: 111.7253 })).toBe(false);
    expect(isInsideServiceArea({ lat: -7.3436, lng: 112.2 })).toBe(false);
  });
});

describe("outsideServiceAreaMessage", () => {
  it("returns null for points inside Nganjuk and Jombang", () => {
    expect(outsideServiceAreaMessage(ALUN_ALUN_NGANJUK, "Alun-Alun")).toBe(
      null,
    );
    expect(
      outsideServiceAreaMessage(STASIUN_KERTOSONO, "Stasiun Kertosono"),
    ).toBe(null);
    expect(outsideServiceAreaMessage(JOMBANG, "Jombang")).toBe(null);
  });

  it("warns for Stasiun Madiun (~41 km away) with the distance", () => {
    const message = outsideServiceAreaMessage(
      STASIUN_MADIUN,
      "Stasiun Madiun",
    );
    expect(message).toContain("Stasiun Madiun di luar area layanan");
    expect(message).toContain("hanya melayani Kabupaten Nganjuk dan Jombang");
    expect(message).toMatch(/sekitar 41,5 km dari Alun-Alun Nganjuk/);
  });

  it("warns for Surabaya with its ~101 km distance", () => {
    const message = outsideServiceAreaMessage(SURABAYA, "Surabaya");
    expect(message).toContain("Surabaya di luar area layanan");
    expect(message).toMatch(/sekitar 101,4 km dari Alun-Alun Nganjuk/);
  });

  it("throws on invalid coordinates", () => {
    expect(() =>
      outsideServiceAreaMessage({ lat: Number.NaN, lng: 111 }, "X"),
    ).toThrow(RangeError);
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
