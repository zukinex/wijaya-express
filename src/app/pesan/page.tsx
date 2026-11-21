/**
 * Passenger order form (Req 1, 2, 3, 9, 10) — guest, no login.
 *
 * Flow: pick a service → enter pickup + destination (type an address to
 * search via Nominatim, or tap the map / use "Lokasi saya") → see the
 * live fare → confirm. On success the order is inserted into Supabase
 * and the passenger is routed to /order/[id].
 *
 * When the Supabase backend is not configured, ordering is blocked with
 * the banner message (graceful-degradation rule, Req 10).
 */
"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { calculateFare, formatRupiah } from "@/lib/fare";
import {
  MADIUN_CENTER,
  formatDistance,
  isInsideMadiun,
  type LatLng,
} from "@/lib/geo";
import {
  createGeocoder,
  getRoute,
  reverseGeocode,
  type GeocodeResult,
  type Geocoder,
} from "@/lib/routing";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  ORDER_SERVICES,
  SERVICE_LABELS,
  createOrder,
  validateOrderInput,
  type OrderService,
  type OrderValidationErrors,
} from "@/lib/orders";
import type { MapPointKind } from "@/components/OrderMap";

const OrderMap = dynamic(() => import("@/components/OrderMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-lg border text-sm text-slate-500">
      Memuat peta…
    </div>
  ),
});

interface RouteInfo {
  distanceKm: number;
  isEstimate: boolean;
  geometry: Array<[number, number]> | null;
}

const SERVICE_DESCRIPTIONS: Record<OrderService, string> = {
  ride: "Naik ojek motor ke mana saja di Kota Madiun.",
  parcel: "Kirim paket atau barang dalam kota.",
  food: "Driver belikan makanan di warung, lalu antar ke kamu.",
};

export default function OrderFormPage() {
  const router = useRouter();
  const backendConfigured = isSupabaseConfigured();

  const [service, setService] = useState<OrderService>("ride");
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupPoint, setPickupPoint] = useState<LatLng | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffPoint, setDropoffPoint] = useState<LatLng | null>(null);
  const [foodWarung, setFoodWarung] = useState("");
  const [foodOrder, setFoodOrder] = useState("");
  const [activePoint, setActivePoint] = useState<MapPointKind>("pickup");
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pickupSuggestions, setPickupSuggestions] = useState<
    GeocodeResult[]
  >([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<
    GeocodeResult[]
  >([]);
  const [errors, setErrors] = useState<OrderValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const geocoderRef = useRef<Geocoder | null>(null);
  const geocoder = (): Geocoder => {
    if (!geocoderRef.current) geocoderRef.current = createGeocoder();
    return geocoderRef.current;
  };

  // Recompute the route (OSRM, Haversine fallback) when both points change.
  useEffect(() => {
    if (!pickupPoint || !dropoffPoint) {
      setRouteInfo(null);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    getRoute(pickupPoint, dropoffPoint)
      .then((route) => {
        if (cancelled) return;
        setRouteInfo({
          distanceKm: route.distanceKm,
          isEstimate: route.isEstimate,
          geometry: route.geometry,
        });
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickupPoint, dropoffPoint]);

  const searchAddress = (
    text: string,
    which: MapPointKind,
  ): void => {
    if (text.trim().length < 3) {
      if (which === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }
    geocoder()
      .geocode(text)
      .then((results) => {
        if (which === "pickup") setPickupSuggestions(results);
        else setDropoffSuggestions(results);
      })
      .catch(() => {
        // Search failure just leaves the list empty; the map still works.
      });
  };

  const pickSuggestion = (
    result: GeocodeResult,
    which: MapPointKind,
  ): void => {
    const point: LatLng = { lat: result.lat, lng: result.lng };
    if (which === "pickup") {
      setPickupAddress(result.displayName);
      setPickupPoint(point);
      setPickupSuggestions([]);
    } else {
      setDropoffAddress(result.displayName);
      setDropoffPoint(point);
      setDropoffSuggestions([]);
    }
  };

  const handleMapPoint = (which: MapPointKind, point: LatLng): void => {
    if (which === "pickup") {
      setPickupPoint(point);
      if (!pickupAddress) {
        setPickupAddress(
          `Titik jemput (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
        );
      }
    } else {
      setDropoffPoint(point);
      if (!dropoffAddress) {
        setDropoffAddress(
          `Titik tujuan (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
        );
      }
    }
  };

  const useMyLocation = (): void => {
    if (!navigator.geolocation) {
      setSubmitError("Browser ini tidak mendukung lokasi GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setPickupPoint(point);
        const name = await reverseGeocode(point);
        setPickupAddress(
          name ??
            `Lokasi saya (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
        );
        setLocating(false);
      },
      () => {
        setSubmitError(
          "Tidak bisa membaca lokasi — izinkan akses lokasi di browser, atau pilih titik di peta.",
        );
        setLocating(false);
      },
      { timeout: 10000 },
    );
  };

  const pickupOutside =
    pickupPoint !== null && !isInsideMadiun(pickupPoint);
  const dropoffOutside =
    dropoffPoint !== null && !isInsideMadiun(dropoffPoint);
  const fare =
    routeInfo && routeInfo.distanceKm > 0
      ? calculateFare(routeInfo.distanceKm)
      : null;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);

    if (!backendConfigured) {
      setSubmitError(
        "Backend belum dikonfigurasi — pemesanan belum bisa dilakukan. Operator perlu menghubungkan Supabase terlebih dahulu.",
      );
      return;
    }
    if (!pickupPoint || !dropoffPoint) {
      setErrors((prev) => ({
        ...prev,
        pickup: pickupPoint ? prev.pickup : "Pilih titik jemput di peta.",
        dropoff: dropoffPoint ? prev.dropoff : "Pilih titik tujuan di peta.",
      }));
      return;
    }
    const input = {
      service,
      passengerName,
      passengerPhone,
      pickup: { address: pickupAddress, point: pickupPoint },
      dropoff: { address: dropoffAddress, point: dropoffPoint },
      distanceKm: routeInfo?.distanceKm ?? 0,
      foodWarung: service === "food" ? foodWarung : undefined,
      foodOrder: service === "food" ? foodOrder : undefined,
    };
    const validation = validateOrderInput(input);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setSubmitError(
        "Backend belum dikonfigurasi — pemesanan belum bisa dilakukan.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await createOrder(client, input);
      router.push(`/order/${id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Gagal membuat pesanan — coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold">Buat Pesanan</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tanpa akun — isi alamat, lihat tarif, konfirmasi. Bayar tunai
          saat sampai.
        </p>
      </header>

      {!backendConfigured && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Backend belum dikonfigurasi — pemesanan belum bisa dilakukan.
          Operator perlu menghubungkan Supabase terlebih dahulu.
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <section>
          <h2 className="font-semibold">1. Pilih layanan</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ORDER_SERVICES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setService(option)}
                aria-pressed={service === option}
                className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold ${
                  service === option
                    ? "border-green-600 bg-green-50 text-green-800"
                    : "border-slate-300 bg-white"
                }`}
              >
                {SERVICE_LABELS[option]}
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {SERVICE_DESCRIPTIONS[option]}
                </span>
              </button>
            ))}
          </div>
          {errors.service && (
            <p className="mt-1 text-sm text-red-700">{errors.service}</p>
          )}
        </section>

        <section>
          <h2 className="font-semibold">2. Alamat jemput &amp; tujuan</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ketik alamat untuk mencari, atau ketuk peta di bawah. Titik
            hijau (J) = jemput, titik merah (T) = tujuan.
          </p>

          <label className="mt-3 block text-sm font-medium">
            Alamat jemput
            <input
              type="text"
              value={pickupAddress}
              onChange={(e) => {
                setPickupAddress(e.target.value);
                searchAddress(e.target.value, "pickup");
              }}
              onFocus={() => setActivePoint("pickup")}
              placeholder="Contoh: Alun-Alun Madiun"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {pickupSuggestions.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
              {pickupSuggestions.map((s) => (
                <li key={`${s.lat},${s.lng}`}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(s, "pickup")}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                  >
                    {s.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {locating ? "Membaca lokasi…" : "📍 Pakai lokasi saya"}
          </button>
          {errors.pickup && (
            <p className="mt-1 text-sm text-red-700">{errors.pickup}</p>
          )}
          {pickupOutside && (
            <p className="mt-1 text-sm text-red-700">
              Titik jemput di luar area layanan — Wijaya Express hanya
              melayani Kota Madiun.
            </p>
          )}

          <label className="mt-4 block text-sm font-medium">
            Alamat tujuan
            <input
              type="text"
              value={dropoffAddress}
              onChange={(e) => {
                setDropoffAddress(e.target.value);
                searchAddress(e.target.value, "dropoff");
              }}
              onFocus={() => setActivePoint("dropoff")}
              placeholder="Contoh: Stasiun Madiun"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {dropoffSuggestions.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
              {dropoffSuggestions.map((s) => (
                <li key={`${s.lat},${s.lng}`}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(s, "dropoff")}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                  >
                    {s.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.dropoff && (
            <p className="mt-1 text-sm text-red-700">{errors.dropoff}</p>
          )}
          {dropoffOutside && (
            <p className="mt-1 text-sm text-red-700">
              Titik tujuan di luar area layanan — Wijaya Express hanya
              melayani Kota Madiun.
            </p>
          )}

          <div className="mt-3 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setActivePoint("pickup")}
              aria-pressed={activePoint === "pickup"}
              className={`rounded-full border px-3 py-1 ${
                activePoint === "pickup"
                  ? "border-green-600 bg-green-50 font-semibold text-green-800"
                  : "border-slate-300"
              }`}
            >
              Atur titik jemput (J)
            </button>
            <button
              type="button"
              onClick={() => setActivePoint("dropoff")}
              aria-pressed={activePoint === "dropoff"}
              className={`rounded-full border px-3 py-1 ${
                activePoint === "dropoff"
                  ? "border-red-600 bg-red-50 font-semibold text-red-800"
                  : "border-slate-300"
              }`}
            >
              Atur titik tujuan (T)
            </button>
          </div>

          <div className="mt-2">
            <OrderMap
              pickup={pickupPoint}
              dropoff={dropoffPoint}
              activePoint={activePoint}
              onPointChange={handleMapPoint}
              routeGeometry={routeInfo?.geometry ?? null}
            />
            <p className="mt-1 text-xs text-slate-500">
              Peta: © OpenStreetMap contributors. Ketuk peta untuk
              menaruh titik {activePoint === "pickup" ? "jemput" : "tujuan"}
              . Pusat peta: Alun-Alun Madiun ({MADIUN_CENTER.lat},{" "}
              {MADIUN_CENTER.lng}).
            </p>
          </div>
        </section>

        {service === "food" && (
          <section>
            <h2 className="font-semibold">3. Pesanan makanan</h2>
            <label className="mt-2 block text-sm font-medium">
              Warung / resto
              <input
                type="text"
                value={foodWarung}
                onChange={(e) => setFoodWarung(e.target.value)}
                placeholder="Contoh: Warung Bu Tini"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            {errors.foodWarung && (
              <p className="mt-1 text-sm text-red-700">{errors.foodWarung}</p>
            )}
            <label className="mt-3 block text-sm font-medium">
              Pesanan (menu + jumlah)
              <textarea
                value={foodOrder}
                onChange={(e) => setFoodOrder(e.target.value)}
                placeholder="Contoh: Nasi pecel 2, es teh 1"
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            {errors.foodOrder && (
              <p className="mt-1 text-sm text-red-700">{errors.foodOrder}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Driver membelikan makanan di warung (ditalangi dulu), kamu
              bayar tunai saat antar: harga makanan + ongkir.
            </p>
          </section>
        )}

        <section className="rounded-lg border bg-slate-50 px-4 py-3">
          <h2 className="font-semibold">Tarif</h2>
          {routeLoading && (
            <p className="mt-1 text-sm text-slate-600">
              Menghitung jarak…
            </p>
          )}
          {!routeLoading && routeInfo && fare !== null && (
            <div className="mt-1 text-sm text-slate-700">
              <p>
                Jarak: {formatDistance(routeInfo.distanceKm)}
                {routeInfo.isEstimate && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    estimasi
                  </span>
                )}
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatRupiah(fare)}
                {service === "food" && (
                  <span className="ml-2 text-sm font-normal text-slate-600">
                    (ongkir saja — harga makanan menyusul)
                  </span>
                )}
              </p>
              {routeInfo.isEstimate && (
                <p className="mt-1 text-xs text-slate-500">
                  Jarak jalan tidak bisa dihitung saat ini, jadi tarif
                  dihitung dari garis lurus × 1,3.
                </p>
              )}
            </div>
          )}
          {!routeLoading && !routeInfo && (
            <p className="mt-1 text-sm text-slate-600">
              Pilih titik jemput dan tujuan untuk melihat tarif. Rp 6.000
              untuk 2 km pertama, +Rp 3.500 per km berikutnya.
            </p>
          )}
          {errors.distance && (
            <p className="mt-1 text-sm text-red-700">{errors.distance}</p>
          )}
        </section>

        <section>
          <h2 className="font-semibold">
            {service === "food" ? "4" : "3"}. Data penumpang
          </h2>
          <label className="mt-2 block text-sm font-medium">
            Nama
            <input
              type="text"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
              placeholder="Contoh: Budi"
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {errors.passengerName && (
            <p className="mt-1 text-sm text-red-700">
              {errors.passengerName}
            </p>
          )}
          <label className="mt-3 block text-sm font-medium">
            Nomor HP (WhatsApp)
            <input
              type="tel"
              value={passengerPhone}
              onChange={(e) => setPassengerPhone(e.target.value)}
              placeholder="Contoh: 0812 3456 7890"
              autoComplete="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {errors.passengerPhone && (
            <p className="mt-1 text-sm text-red-700">
              {errors.passengerPhone}
            </p>
          )}
        </section>

        <button
          type="submit"
          disabled={submitting || !backendConfigured}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Membuat pesanan…" : "Buat Pesanan — Bayar Tunai"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Dengan menekan tombol di atas, kamu memesan {SERVICE_LABELS[service]}
          . Driver terdekat akan menerima pesananmu.
        </p>
      </form>
    </main>
  );
}
