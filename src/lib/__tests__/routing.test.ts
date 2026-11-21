import { describe, expect, it, vi } from "vitest";
import {
  createGeocoder,
  geocodeAddress,
  getRoute,
  reverseGeocode,
  type FetchFn,
  type GeocodeResult,
} from "../routing";
import { haversineKm, type LatLng } from "../geo";

const ALUN_ALUN: LatLng = { lat: -7.6298, lng: 111.5235 };
const STASIUN: LatLng = { lat: -7.6219, lng: 111.5153 };

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("getRoute", () => {
  it("returns the OSRM road distance and geometry on success", async () => {
    const fetchFn: FetchFn = vi.fn((_url: RequestInfo | URL) =>
      Promise.resolve(
        jsonResponse({
          code: "Ok",
          routes: [
            {
              distance: 2500,
              geometry: {
                coordinates: [
                  [111.5235, -7.6298],
                  [111.5153, -7.6219],
                ],
              },
            },
          ],
        }),
      ),
    );
    const result = await getRoute(ALUN_ALUN, STASIUN, fetchFn);
    expect(result.distanceKm).toBe(2.5);
    expect(result.distanceMeters).toBe(2500);
    expect(result.isEstimate).toBe(false);
    expect(result.source).toBe("osrm");
    expect(result.geometry).toEqual([
      [111.5235, -7.6298],
      [111.5153, -7.6219],
    ]);
    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("router.project-osrm.org");
    expect(calledUrl).toContain("111.5235,-7.6298;111.5153,-7.6219");
  });

  it("falls back to Haversine × 1.3 when OSRM returns no route", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse({ code: "NoRoute", routes: [] })),
    );
    const result = await getRoute(ALUN_ALUN, STASIUN, fetchFn);
    const expected = haversineKm(ALUN_ALUN, STASIUN) * 1.3;
    expect(result.distanceKm).toBeCloseTo(expected, 6);
    expect(result.isEstimate).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.geometry).toBeNull();
  });

  it("falls back when the request fails (network down)", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.reject(new Error("network down")),
    );
    const result = await getRoute(ALUN_ALUN, STASIUN, fetchFn);
    expect(result.isEstimate).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("falls back when OSRM returns a non-OK response", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "error" }, false)),
    );
    const result = await getRoute(ALUN_ALUN, STASIUN, fetchFn);
    expect(result.isEstimate).toBe(true);
    expect(result.source).toBe("fallback");
  });

  it("falls back on timeout", async () => {
    // Mock fetch that respects the abort signal, like the real fetch.
    const fetchFn: FetchFn = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const result = await getRoute(ALUN_ALUN, STASIUN, fetchFn, 20);
    expect(result.isEstimate).toBe(true);
    expect(result.source).toBe("fallback");
  });
});

describe("geocodeAddress", () => {
  it("maps Nominatim results to lat/lng", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(
        jsonResponse([
          {
            display_name: "Alun-Alun Madiun, Kota Madiun",
            lat: "-7.6298",
            lon: "111.5235",
          },
          {
            display_name: "Stasiun Madiun, Kota Madiun",
            lat: "-7.6219",
            lon: "111.5153",
          },
        ]),
      ),
    );
    const results = await geocodeAddress("Alun-Alun Madiun", fetchFn);
    expect(results).toEqual([
      {
        displayName: "Alun-Alun Madiun, Kota Madiun",
        lat: -7.6298,
        lng: 111.5235,
      },
      {
        displayName: "Stasiun Madiun, Kota Madiun",
        lat: -7.6219,
        lng: 111.5153,
      },
    ]);
    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("nominatim.openstreetmap.org/search");
    expect(calledUrl).toContain("countrycodes=id");
    expect(calledUrl).toContain("bounded=1");
  });

  it("returns [] when nothing matches", async () => {
    const fetchFn: FetchFn = vi.fn(() => Promise.resolve(jsonResponse([])));
    await expect(geocodeAddress("asdfghjkl", fetchFn)).resolves.toEqual([]);
  });

  it("throws on an empty query", async () => {
    const fetchFn: FetchFn = vi.fn();
    await expect(geocodeAddress("   ", fetchFn)).rejects.toThrow(
      "Alamat kosong",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws on a failed request", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: "x" }, false)),
    );
    await expect(geocodeAddress("Madiun", fetchFn)).rejects.toThrow(
      "Pencarian alamat gagal",
    );
  });

  it("skips malformed items", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(
        jsonResponse([
          { display_name: "OK", lat: "-7.6", lon: "111.5" },
          { display_name: "No coords" },
          { display_name: "Bad lat", lat: "xx", lon: "111.5" },
        ]),
      ),
    );
    const results = await geocodeAddress("Madiun", fetchFn);
    expect(results).toHaveLength(1);
    expect(results[0]?.displayName).toBe("OK");
  });
});

describe("reverseGeocode", () => {
  it("returns the display name for a point", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ display_name: "Jl. Pahlawan, Kota Madiun" }),
      ),
    );
    await expect(reverseGeocode(ALUN_ALUN, fetchFn)).resolves.toBe(
      "Jl. Pahlawan, Kota Madiun",
    );
    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledUrl).toContain("nominatim.openstreetmap.org/reverse");
    expect(calledUrl).toContain("lat=-7.6298");
  });

  it("returns null on failure instead of throwing", async () => {
    const fetchFn: FetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: "x" }, false)),
    );
    await expect(reverseGeocode(ALUN_ALUN, fetchFn)).resolves.toBeNull();
    const failing: FetchFn = vi.fn(() =>
      Promise.reject(new Error("down")),
    );
    await expect(reverseGeocode(ALUN_ALUN, failing)).resolves.toBeNull();
  });
});

describe("createGeocoder (debounce + throttle)", () => {
  // Real timers with small intervals: fake timers deadlock with the
  // nested setTimeout chain inside the geocoder.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("collapses rapid calls into one request for the latest query", async () => {
    const fetchFn: FetchFn = vi.fn((_url: RequestInfo | URL) =>
      Promise.resolve(
        jsonResponse([
          { display_name: "Hasil", lat: "-7.6", lon: "111.5" },
        ]),
      ),
    );
    const geocoder = createGeocoder({
      fetchFn,
      debounceMs: 20,
      minIntervalMs: 50,
    });
    const p1 = geocoder.geocode("Alun");
    const p2 = geocoder.geocode("Alun-Alun");
    const p3 = geocoder.geocode("Alun-Alun Madiun");

    const results = await Promise.all([p1, p2, p3]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(decodeURIComponent(calledUrl).replace(/\+/g, " ")).toContain(
      "Alun-Alun Madiun",
    );
    const expected: GeocodeResult[] = [
      { displayName: "Hasil", lat: -7.6, lng: 111.5 },
    ];
    expect(results).toEqual([expected, expected, expected]);
  });

  it("spaces real requests at least minIntervalMs apart", async () => {
    const fetchFn: FetchFn = vi.fn((_url: RequestInfo | URL) =>
      Promise.resolve(jsonResponse([])),
    );
    const geocoder = createGeocoder({
      fetchFn,
      debounceMs: 10,
      minIntervalMs: 80,
    });
    const p1 = geocoder.geocode("satu");
    await p1;
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const p2 = geocoder.geocode("dua");
    await sleep(30);
    // Still throttled: the 80 ms gap since the first request has not elapsed.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await p2;
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
