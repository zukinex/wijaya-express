/**
 * Driver view (Req 4, 5, 6, 7) — /driver.
 *
 * Drivers sign in with Supabase Auth (email + password), toggle
 * online/offline, see new `created` orders live, accept one (atomic
 * first-accept — the loser sees "sudah diambil driver lain"), and move
 * their active order forward (picked_up / delivered / cash received /
 * cancel). For food orders, picked_up asks for the food price paid at
 * the warung. Navigation links open the phone's maps app (no in-app
 * turn-by-turn in v1).
 *
 * Live updates: Supabase Realtime subscription on the orders table,
 * plus a 15-second polling fallback (same pattern as the passenger
 * status page).
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { formatRupiah } from "@/lib/fare";
import { formatDistance } from "@/lib/geo";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  SERVICE_LABELS,
  STATUS_LABELS,
  type OrderRow,
} from "@/lib/orders";
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
} from "@/lib/driver";

export default function DriverPage() {
  const backendConfigured = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [createdOrders, setCreatedOrders] = useState<OrderRow[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const [foodPrice, setFoodPrice] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // The auth client is stable for the session; keep it in a ref so
  // effects below don't re-subscribe on every render.
  const clientRef = useRef(getSupabaseClient());

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setProfileMissing(false);
      return;
    }
    const client = clientRef.current;
    if (!client) return;
    const p = await getMyDriverProfile(client, u.id);
    setProfile(p);
    setProfileMissing(p === null);
  }, []);

  const refreshOrders = useCallback(async () => {
    const client = clientRef.current;
    const p = profile;
    if (!client || !p || p.role !== "driver" || !p.is_active) return;
    try {
      const [created, active] = await Promise.all([
        p.is_online ? listCreatedOrders(client) : Promise.resolve([]),
        getMyActiveOrder(client, p.id),
      ]);
      setCreatedOrders(created);
      setActiveOrder(active);
      setListError(null);
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "Gagal memuat order.",
      );
    }
  }, [profile]);

  // Session restore + auth state changes.
  useEffect(() => {
    if (!backendConfigured) {
      setLoading(false);
      return;
    }
    const client = clientRef.current;
    if (!client) {
      setLoading(false);
      return;
    }
    let alive = true;
    getSessionUser(client).then((u) => {
      if (!alive) return;
      setUser(u);
      loadProfile(u).finally(() => {
        if (alive) setLoading(false);
      });
    });
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        loadProfile(u);
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [backendConfigured, loadProfile]);

  // Live order lists (Realtime + 15s polling fallback).
  useEffect(() => {
    if (!user || !profile || profile.role !== "driver" || !profile.is_active) {
      return;
    }
    const client = clientRef.current;
    if (!client) return;
    refreshOrders();
    const channel = client
      .channel("driver-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          refreshOrders();
        },
      )
      .subscribe();
    const poll = setInterval(refreshOrders, 15000);
    return () => {
      clearInterval(poll);
      client.removeChannel(channel);
    };
  }, [user, profile, refreshOrders]);

  const handleSignIn = async () => {
    const client = clientRef.current;
    if (!client) return;
    setSigningIn(true);
    setAuthError(null);
    const result = await signInWithPassword(client, email, password);
    setSigningIn(false);
    if ("error" in result) {
      setAuthError(result.error);
      return;
    }
    setUser(result.user);
    setPassword("");
    await loadProfile(result.user);
  };

  const handleSignOut = async () => {
    const client = clientRef.current;
    if (!client) return;
    await signOut(client);
    setUser(null);
    setProfile(null);
    setCreatedOrders([]);
    setActiveOrder(null);
  };

  const handleToggleOnline = async () => {
    const client = clientRef.current;
    if (!client || !profile) return;
    const next = !profile.is_online;
    setTogglingOnline(true);
    setActionError(null);
    try {
      await setDriverOnline(client, profile.id, next);
      setProfile({ ...profile, is_online: next });
      if (next) {
        // Best effort: save one GPS fix when going online. Never blocks
        // the toggle when permission is denied or GPS is unavailable.
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setDriverLocation(
                client,
                profile.id,
                pos.coords.latitude,
                pos.coords.longitude,
              ).catch(() => {
                /* abaikan — lokasi tidak wajib */
              });
            },
            () => {
              /* izin lokasi ditolak — tetap online */
            },
            { timeout: 8000 },
          );
        }
      }
      await refreshOrders();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Gagal mengubah status online.",
      );
    } finally {
      setTogglingOnline(false);
    }
  };

  const handleAccept = async (orderId: string) => {
    const client = clientRef.current;
    if (!client || !profile) return;
    setActionBusy(true);
    setActionError(null);
    const result = await acceptOrder(client, orderId, profile.id);
    setActionBusy(false);
    if (!result.ok) {
      setActionError(result.message);
    }
    await refreshOrders();
  };

  const handleAdvance = async (
    to: "picked_up" | "delivered" | "completed" | "cancelled",
  ) => {
    const client = clientRef.current;
    if (!client || !profile || !activeOrder) return;
    let foodPriceIdr: number | undefined;
    if (to === "picked_up" && activeOrder.service === "food") {
      foodPriceIdr = parseInt(foodPrice.replace(/[^0-9]/g, ""), 10);
      if (!Number.isInteger(foodPriceIdr) || foodPriceIdr <= 0) {
        setActionError(
          "Isi harga makanan yang dibayar di warung (angka rupiah, lebih dari 0).",
        );
        return;
      }
    }
    setActionBusy(true);
    setActionError(null);
    const result = await advanceOrder(client, activeOrder, profile.id, to, {
      foodPriceIdr,
      cancelReason: to === "cancelled" ? cancelReason : undefined,
    });
    setActionBusy(false);
    if (!result.ok) {
      setActionError(result.message);
    } else {
      setFoodPrice("");
      setShowCancel(false);
      setCancelReason("");
    }
    await refreshOrders();
  };

  const isDriver = profile?.role === "driver";
  const urls = activeOrder ? navigateUrls(activeOrder) : null;
  const parsedFoodPrice = parseInt(foodPrice.replace(/[^0-9]/g, ""), 10);
  const foodTotalPreview =
    activeOrder?.service === "food" &&
    Number.isInteger(parsedFoodPrice) &&
    parsedFoodPrice > 0
      ? parsedFoodPrice + activeOrder.fare_idr
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold">Aplikasi Driver</h1>
        <p className="mt-1 text-sm text-slate-600">
          Wijaya Express — ojek lokal Kota Madiun.
        </p>
      </header>

      {!backendConfigured && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Backend belum dikonfigurasi — aplikasi driver belum bisa dipakai.
        </div>
      )}

      {loading && backendConfigured && (
        <p className="mt-6 text-sm text-slate-600">Memuat…</p>
      )}

      {!loading && backendConfigured && !user && (
        <section className="mt-6 rounded-lg border px-4 py-4">
          <h2 className="font-semibold">Masuk sebagai driver</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pakai email dan password yang diberikan admin.
          </p>
          <label className="mt-4 block text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver1@wijayaexpress.test"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="mt-3 block text-sm">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSignIn();
              }}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          {authError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {authError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn || !email || !password}
            className="mt-4 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {signingIn ? "Masuk…" : "Masuk"}
          </button>
        </section>
      )}

      {!loading && user && profileMissing && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Akun ini belum terdaftar sebagai driver — hubungi admin supaya
          akunmu didaftarkan dulu.
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Keluar
          </button>
        </div>
      )}

      {!loading && user && profile && profile.role === "admin" && (
        <div
          role="status"
          className="mt-6 rounded-lg border px-4 py-3 text-sm"
        >
          <p className="font-semibold">Kamu masuk sebagai admin.</p>
          <p className="mt-1 text-slate-600">
            Halaman admin (semua order, kelola driver, ubah tarif) menyusul
            di Fase 4. Halaman ini hanya untuk driver.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Keluar
          </button>
        </div>
      )}

      {!loading && user && profile && isDriver && (
        <div className="mt-6 space-y-4">
          <section className="rounded-lg border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{profile.display_name}</p>
                <p className="text-sm text-slate-600">
                  {profile.vehicle_model ?? "Motor"} • {profile.vehicle_plate}
                </p>
                <p className="text-sm text-slate-600">
                  Status:{" "}
                  {profile.is_online ? "Online" : "Offline"}
                  {!profile.is_active && " — akun nonaktif"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Keluar
              </button>
            </div>
            {profile.is_active ? (
              <button
                type="button"
                onClick={handleToggleOnline}
                disabled={togglingOnline}
                className={`mt-3 w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-50 ${
                  profile.is_online ? "bg-slate-600" : "bg-green-600"
                }`}
              >
                {togglingOnline
                  ? "Menyimpan…"
                  : profile.is_online
                    ? "Offline — berhenti terima order"
                    : "Online — mulai terima order"}
              </button>
            ) : (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                Akun driver kamu nonaktif — hubungi admin.
              </p>
            )}
          </section>

          {actionError && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {actionError}
            </div>
          )}
          {listError && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {listError}
            </div>
          )}

          {activeOrder && (
            <section className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <h2 className="font-semibold text-green-900">Order aktif</h2>
              <p className="mt-1 text-sm text-green-900">
                {SERVICE_LABELS[activeOrder.service]} •{" "}
                {STATUS_LABELS[activeOrder.status]}
              </p>
              <p className="mt-2 text-sm text-green-900">
                Penumpang: {activeOrder.passenger_name}
              </p>
              <a
                href={`tel:${activeOrder.passenger_phone}`}
                className="text-sm font-semibold text-green-800 underline"
              >
                {activeOrder.passenger_phone}
              </a>
              <p className="mt-2 text-sm text-green-900">
                Jemput: {activeOrder.pickup_address}
              </p>
              <p className="text-sm text-green-900">
                Tujuan: {activeOrder.dropoff_address}
              </p>
              {activeOrder.food_details && (
                <p className="mt-2 whitespace-pre-line rounded bg-white px-3 py-2 text-sm text-slate-700">
                  {activeOrder.food_details}
                </p>
              )}
              <p className="mt-2 text-sm text-green-900">
                Jarak: {formatDistance(activeOrder.distance_km)} • Ongkir:{" "}
                {formatRupiah(activeOrder.fare_idr)}
              </p>
              {activeOrder.service === "food" && (
                <p className="text-sm text-green-900">
                  Harga makanan:{" "}
                  {activeOrder.food_price_idr !== null
                    ? formatRupiah(activeOrder.food_price_idr)
                    : "belum diisi"}
                  {" • "}
                  Total tunai:{" "}
                  {activeOrder.food_price_idr !== null
                    ? formatRupiah(
                        activeOrder.food_price_idr + activeOrder.fare_idr,
                      )
                    : formatRupiah(activeOrder.fare_idr) + " + harga makanan"}
                </p>
              )}

              {urls && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeOrder.status === "accepted" && (
                    <a
                      href={urls.pickupGoogleMaps}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Navigasi ke jemput
                    </a>
                  )}
                  {activeOrder.status !== "accepted" && (
                    <a
                      href={urls.dropoffGoogleMaps}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Navigasi ke tujuan
                    </a>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-3">
                {activeOrder.status === "accepted" && (
                  <>
                    {activeOrder.service === "food" && (
                      <label className="block text-sm text-green-900">
                        Harga makanan yang dibayar di warung (Rp)
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={foodPrice}
                          onChange={(e) => setFoodPrice(e.target.value)}
                          placeholder="contoh: 25000"
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-slate-900"
                        />
                        {foodTotalPreview !== null && (
                          <span className="mt-1 block text-xs">
                            Total tunai nanti:{" "}
                            {formatRupiah(foodTotalPreview)} (makanan{" "}
                            {formatRupiah(parsedFoodPrice)} + ongkir{" "}
                            {formatRupiah(activeOrder.fare_idr)})
                          </span>
                        )}
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAdvance("picked_up")}
                      disabled={actionBusy}
                      className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                    >
                      {actionBusy
                        ? "Menyimpan…"
                        : activeOrder.service === "food"
                          ? "Makanan sudah dibeli di warung"
                          : "Penumpang sudah naik / barang sudah diambil"}
                    </button>
                    {!showCancel ? (
                      <button
                        type="button"
                        onClick={() => setShowCancel(true)}
                        disabled={actionBusy}
                        className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
                      >
                        Batalkan order ini
                      </button>
                    ) : (
                      <div className="rounded-lg border border-red-300 bg-white px-3 py-3">
                        <label className="block text-sm text-slate-700">
                          Alasan batal (opsional)
                          <input
                            type="text"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="contoh: Motor mogok"
                            className="mt-1 w-full rounded-lg border px-3 py-2"
                          />
                        </label>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAdvance("cancelled")}
                            disabled={actionBusy}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Ya, batalkan
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCancel(false);
                              setCancelReason("");
                            }}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                          >
                            Tidak jadi
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {activeOrder.status === "picked_up" && (
                  <button
                    type="button"
                    onClick={() => handleAdvance("delivered")}
                    disabled={actionBusy}
                    className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {actionBusy ? "Menyimpan…" : "Sampai tujuan"}
                  </button>
                )}
                {activeOrder.status === "delivered" && (
                  <button
                    type="button"
                    onClick={() => handleAdvance("completed")}
                    disabled={actionBusy}
                    className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {actionBusy
                      ? "Menyimpan…"
                      : `Tunai diterima — selesai (${formatRupiah(
                          activeOrder.service === "food" &&
                            activeOrder.food_price_idr !== null
                            ? activeOrder.food_price_idr + activeOrder.fare_idr
                            : activeOrder.fare_idr,
                        )})`}
                  </button>
                )}
              </div>
            </section>
          )}

          {profile.is_online && !activeOrder && (
            <section>
              <h2 className="font-semibold">Order baru</h2>
              {createdOrders.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  Belum ada order baru. Order yang masuk akan muncul di sini
                  langsung.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {createdOrders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-lg border px-4 py-3"
                    >
                      <p className="font-semibold">
                        {SERVICE_LABELS[order.service]} •{" "}
                        {formatDistance(order.distance_km)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Jemput: {order.pickup_address}
                      </p>
                      <p className="text-sm text-slate-700">
                        Tujuan: {order.dropoff_address}
                      </p>
                      {order.food_details && (
                        <p className="mt-1 whitespace-pre-line rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {order.food_details}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-slate-700">
                        Penumpang: {order.passenger_name} • Ongkir:{" "}
                        {formatRupiah(order.fare_idr)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleAccept(order.id)}
                        disabled={actionBusy}
                        className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                      >
                        {actionBusy ? "Memproses…" : "Terima order ini"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {!profile.is_online && !activeOrder && (
            <p className="text-sm text-slate-600">
              Kamu offline — order baru tidak akan muncul sampai kamu online
              lagi.
            </p>
          )}

          <div>
            <Link
              href="/"
              className="text-sm text-slate-600 underline"
            >
              Kembali ke beranda
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
