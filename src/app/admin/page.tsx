/**
 * Admin view (Req 8, Phase 4 task 15) — /admin.
 *
 * The operator signs in with Supabase Auth (email + password) and must
 * have the `admin` role (profile check via getMyDriverProfile — it
 * returns the role for drivers and admins alike). Three sections:
 *   1. Semua Order — all orders newest first, filterable by status and
 *      service; click one to see its full timeline (created → accepted
 *      → picked_up → delivered → completed/cancelled, with times).
 *   2. Driver — the launch drivers with online status, vehicle plate,
 *      and an active/inactive switch (inactive drivers never receive
 *      orders).
 *   3. Tarif — edit the base fare, included km, and per-km rate (writes
 *      to the single tariffs row, id = 1). Orders created after a
 *      change use the new tariff; existing orders keep their stored
 *      fare (task 16 — proven by admin.test.ts).
 *
 * Live updates: Supabase Realtime subscription on the orders table,
 * plus a 15-second polling fallback (same pattern as the driver view).
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
  calculateFareWithTariff,
  type OrderRow,
  type OrderService,
  type OrderStatus,
  type TariffRow,
} from "@/lib/orders";
import {
  getMyDriverProfile,
  getSessionUser,
  signInWithPassword,
  signOut,
  type DriverProfile,
} from "@/lib/driver";
import {
  getOrderTimeline,
  getTariff,
  listAllDrivers,
  listAllOrders,
  setDriverActive,
  updateTariff,
  validateTariffInput,
  type AdminDriverRow,
} from "@/lib/admin";

type AdminTab = "orders" | "drivers" | "tariff";

const STATUS_FILTERS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "Semua status" },
  { value: "created", label: "Mencari driver" },
  { value: "accepted", label: "Driver ditemukan" },
  { value: "picked_up", label: "Sudah dijemput" },
  { value: "delivered", label: "Sampai tujuan" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

const SERVICE_FILTERS: Array<{ value: OrderService | "all"; label: string }> = [
  { value: "all", label: "Semua layanan" },
  { value: "ride", label: "Antar Orang" },
  { value: "parcel", label: "Antar Barang" },
  { value: "food", label: "Antar Makanan" },
];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const backendConfigured = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<OrderService | "all">(
    "all",
  );
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [drivers, setDrivers] = useState<AdminDriverRow[]>([]);
  const [tariff, setTariff] = useState<TariffRow | null>(null);
  const [tariffForm, setTariffForm] = useState({
    baseFareIdr: "",
    baseDistanceKm: "",
    perKmIdr: "",
  });
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingDriver, setTogglingDriver] = useState<string | null>(null);

  // The auth client is stable for the session; keep it in a ref so
  // effects below don't re-subscribe on every render.
  const clientRef = useRef(getSupabaseClient());
  // Same for the selected order: refreshOrders reads it without
  // depending on it (so the live channel is not re-subscribed on
  // every selection).
  const selectedOrderRef = useRef<OrderRow | null>(null);
  selectedOrderRef.current = selectedOrder;

  const isAdmin = profile?.role === "admin";

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
    if (!client) return;
    try {
      const rows = await listAllOrders(client, {
        status: statusFilter,
        service: serviceFilter,
      });
      setOrders(rows);
      setListError(null);
      // Keep the open detail in sync with the fresh list.
      const current = selectedOrderRef.current;
      if (current) {
        setSelectedOrder(rows.find((r) => r.id === current.id) ?? null);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Gagal memuat order.");
    }
  }, [statusFilter, serviceFilter]);

  const refreshDrivers = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      setDrivers(await listAllDrivers(client));
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Gagal memuat driver.");
    }
  }, []);

  const refreshTariff = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const row = await getTariff(client);
      if (row) {
        setTariff(row);
        setTariffForm({
          baseFareIdr: String(row.base_fare_idr),
          baseDistanceKm: String(row.base_distance_km),
          perKmIdr: String(row.per_km_idr),
        });
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Gagal memuat tarif.");
    }
  }, []);

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

  // Load admin data once signed in as admin; keep orders live.
  useEffect(() => {
    if (!user || !isAdmin) return;
    const client = clientRef.current;
    if (!client) return;
    refreshOrders();
    refreshDrivers();
    refreshTariff();
    const channel = client
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          refreshOrders();
        },
      )
      .subscribe();
    const poll = setInterval(() => {
      refreshOrders();
      refreshDrivers();
    }, 15000);
    return () => {
      clearInterval(poll);
      client.removeChannel(channel);
    };
  }, [user, isAdmin, refreshOrders, refreshDrivers, refreshTariff]);

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
    setOrders([]);
    setDrivers([]);
    setSelectedOrder(null);
  };

  const handleToggleDriverActive = async (driver: AdminDriverRow) => {
    const client = clientRef.current;
    if (!client) return;
    const next = !driver.is_active;
    setTogglingDriver(driver.id);
    setActionError(null);
    setActionNotice(null);
    try {
      await setDriverActive(client, driver.id, next);
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === driver.id ? { ...d, is_active: next } : d,
        ),
      );
      setActionNotice(
        next
          ? `${driver.display_name} diaktifkan — bisa terima order lagi.`
          : `${driver.display_name} dinonaktifkan — tidak akan menerima order baru.`,
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Gagal mengubah status driver.",
      );
    } finally {
      setTogglingDriver(null);
    }
  };

  const handleSaveTariff = async () => {
    const client = clientRef.current;
    if (!client) return;
    const input = {
      baseFareIdr: parseInt(tariffForm.baseFareIdr.replace(/[^0-9]/g, ""), 10),
      baseDistanceKm: parseFloat(tariffForm.baseDistanceKm.replace(",", ".")),
      perKmIdr: parseInt(tariffForm.perKmIdr.replace(/[^0-9]/g, ""), 10),
    };
    const errors = validateTariffInput(input);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      setActionError(firstError);
      return;
    }
    setSaving(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await updateTariff(client, input);
      setTariff(updated);
      setActionNotice(
        "Tarif tersimpan. Order baru memakai tarif baru; order lama tetap memakai tarif yang lama.",
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Gagal menyimpan tarif.",
      );
    } finally {
      setSaving(false);
    }
  };

  const tariffPreviewKm = 5;
  const tariffPreviewFare =
    tariff !== null &&
    Number.isInteger(parseInt(tariffForm.baseFareIdr, 10)) &&
    !Number.isNaN(parseFloat(tariffForm.baseDistanceKm)) &&
    Number.isInteger(parseInt(tariffForm.perKmIdr, 10))
      ? calculateFareWithTariff(tariffPreviewKm, {
          id: 1,
          base_fare_idr: parseInt(tariffForm.baseFareIdr, 10),
          base_distance_km: parseFloat(tariffForm.baseDistanceKm),
          per_km_idr: parseInt(tariffForm.perKmIdr, 10),
        })
      : null;

  const selectedTimeline = selectedOrder
    ? getOrderTimeline(selectedOrder)
    : [];
  const selectedTotalCash =
    selectedOrder?.service === "food" &&
    selectedOrder.food_price_idr !== null
      ? selectedOrder.food_price_idr + selectedOrder.fare_idr
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold">Halaman Admin</h1>
        <p className="mt-1 text-sm text-slate-600">
          Wijaya Express — semua order, driver, dan tarif.
        </p>
      </header>

      {!backendConfigured && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Backend belum dikonfigurasi — halaman admin belum bisa dipakai.
        </div>
      )}

      {loading && backendConfigured && (
        <p className="mt-6 text-sm text-slate-600">Memuat…</p>
      )}

      {!loading && backendConfigured && !user && (
        <section className="mt-6 rounded-lg border px-4 py-4">
          <h2 className="font-semibold">Masuk sebagai admin</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pakai email dan password admin yang diberikan operator.
          </p>
          <label className="mt-4 block text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@wijayaexpress.test"
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
          Akun ini belum terdaftar sebagai admin — hubungi operator supaya
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

      {!loading && user && profile && profile.role === "driver" && (
        <div
          role="status"
          className="mt-6 rounded-lg border px-4 py-3 text-sm"
        >
          <p className="font-semibold">
            Kamu masuk sebagai driver ({profile.display_name}).
          </p>
          <p className="mt-1 text-slate-600">
            Halaman ini hanya untuk admin (operator). Buka{" "}
            <Link href="/driver" className="font-semibold underline">
              aplikasi driver
            </Link>{" "}
            untuk melihat order.
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

      {!loading && user && profile && isAdmin && (
        <div className="mt-6 space-y-4">
          <section className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div>
              <p className="font-semibold">{profile.display_name}</p>
              <p className="text-sm text-slate-600">Admin / operator</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              Keluar
            </button>
          </section>

          <nav className="flex gap-2" aria-label="Bagian admin">
            {(
              [
                ["orders", "Semua Order"],
                ["drivers", "Driver"],
                ["tariff", "Tarif"],
              ] as Array<[AdminTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setActionError(null);
                  setActionNotice(null);
                }}
                aria-current={tab === key ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  tab === key
                    ? "bg-green-600 text-white"
                    : "border border-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {actionError && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {actionError}
            </div>
          )}
          {actionNotice && (
            <div
              role="status"
              className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {actionNotice}
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

          {tab === "orders" && (
            <section>
              <div className="flex flex-wrap gap-2">
                <label className="text-sm">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as OrderStatus | "all")
                    }
                    className="ml-2 rounded-lg border px-2 py-2"
                  >
                    {STATUS_FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Layanan
                  <select
                    value={serviceFilter}
                    onChange={(e) =>
                      setServiceFilter(e.target.value as OrderService | "all")
                    }
                    className="ml-2 rounded-lg border px-2 py-2"
                  >
                    {SERVICE_FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedOrder ? (
                <article className="mt-4 rounded-lg border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="text-sm text-slate-600 underline"
                  >
                    ← Kembali ke daftar order
                  </button>
                  <h2 className="mt-2 font-semibold">
                    {SERVICE_LABELS[selectedOrder.service]} •{" "}
                    {STATUS_LABELS[selectedOrder.status]}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDateTime(selectedOrder.created_at)} •{" "}
                    {formatDistance(selectedOrder.distance_km)} • Ongkir{" "}
                    {formatRupiah(selectedOrder.fare_idr)}
                  </p>
                  <p className="mt-2 text-sm">
                    Penumpang: {selectedOrder.passenger_name} •{" "}
                    <a
                      href={`tel:${selectedOrder.passenger_phone}`}
                      className="font-semibold underline"
                    >
                      {selectedOrder.passenger_phone}
                    </a>
                  </p>
                  {selectedOrder.driver && (
                    <p className="mt-1 text-sm">
                      Driver: {selectedOrder.driver.display_name} •{" "}
                      <a
                        href={`tel:${selectedOrder.driver.phone}`}
                        className="font-semibold underline"
                      >
                        {selectedOrder.driver.phone}
                      </a>
                    </p>
                  )}
                  <p className="mt-2 text-sm">
                    Jemput: {selectedOrder.pickup_address}
                  </p>
                  <p className="text-sm">
                    Tujuan: {selectedOrder.dropoff_address}
                  </p>
                  {selectedOrder.food_details && (
                    <p className="mt-2 whitespace-pre-line rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {selectedOrder.food_details}
                    </p>
                  )}
                  <p className="mt-2 text-sm">
                    Total tunai:{" "}
                    <span className="font-semibold">
                      {selectedTotalCash !== null
                        ? formatRupiah(selectedTotalCash)
                        : formatRupiah(selectedOrder.fare_idr)}
                    </span>
                    {selectedOrder.service === "food" &&
                      selectedTotalCash === null && (
                        <span className="text-slate-500">
                          {" "}
                          + harga makanan (driver isi setelah beli)
                        </span>
                      )}
                  </p>
                  <h3 className="mt-4 font-semibold">Timeline</h3>
                  <ol className="mt-2 space-y-1 text-sm text-slate-700">
                    {selectedTimeline.map((step) => (
                      <li key={step.key}>
                        {step.done ? "✓" : "○"} {step.label}
                        {step.at ? ` — ${formatTime(step.at)}` : ""}
                      </li>
                    ))}
                  </ol>
                </article>
              ) : orders.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  Belum ada order dengan filter ini.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {orders.map((order) => (
                    <article key={order.id} className="rounded-lg border">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="w-full px-4 py-3 text-left"
                      >
                        <p className="font-semibold">
                          {SERVICE_LABELS[order.service]} •{" "}
                          {STATUS_LABELS[order.status]}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {order.passenger_name} • {order.pickup_address} →{" "}
                          {order.dropoff_address}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatDateTime(order.created_at)} •{" "}
                          {formatDistance(order.distance_km)} •{" "}
                          {formatRupiah(order.fare_idr)}
                          {order.driver
                            ? ` • Driver: ${order.driver.display_name}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-green-700 underline">
                          Lihat detail & timeline
                        </p>
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "drivers" && (
            <section>
              <p className="text-sm text-slate-600">
                Driver yang dinonaktifkan tidak akan menerima order baru.
              </p>
              {drivers.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  Belum ada driver terdaftar — daftarkan driver lewat
                  Supabase (lihat test-accounts.md / supabase-seed-drivers.sql).
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {drivers.map((driver) => (
                    <article
                      key={driver.id}
                      className="rounded-lg border px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {driver.display_name}
                          </p>
                          <p className="text-sm text-slate-600">
                            {driver.vehicle_model ?? "Motor"} •{" "}
                            {driver.vehicle_plate}
                          </p>
                          <a
                            href={`tel:${driver.phone}`}
                            className="text-sm font-semibold underline"
                          >
                            {driver.phone}
                          </a>
                          <p className="mt-1 text-sm text-slate-600">
                            Status:{" "}
                            {driver.is_online ? "Online" : "Offline"}
                            {" • "}
                            {driver.is_active ? "Aktif" : "Nonaktif"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleDriverActive(driver)}
                          disabled={togglingDriver === driver.id}
                          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                            driver.is_active ? "bg-red-600" : "bg-green-600"
                          }`}
                        >
                          {togglingDriver === driver.id
                            ? "Menyimpan…"
                            : driver.is_active
                              ? "Nonaktifkan"
                              : "Aktifkan"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "tariff" && (
            <section className="rounded-lg border px-4 py-4">
              <h2 className="font-semibold">Ubah tarif</h2>
              <p className="mt-1 text-sm text-slate-600">
                Tarif ini dipakai semua order baru. Order yang sudah dibuat
                tetap memakai tarif yang lama.
              </p>
              {tariff === null ? (
                <p className="mt-3 text-sm text-slate-600">
                  Tarif belum bisa dimuat.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm">
                    Tarif dasar (Rp, untuk {tariffForm.baseDistanceKm || "…"} km
                    pertama)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={tariffForm.baseFareIdr}
                      onChange={(e) =>
                        setTariffForm((prev) => ({
                          ...prev,
                          baseFareIdr: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Jarak termasuk tarif dasar (km)
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.5"
                      value={tariffForm.baseDistanceKm}
                      onChange={(e) =>
                        setTariffForm((prev) => ({
                          ...prev,
                          baseDistanceKm: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Tarif per km berikutnya (Rp)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={tariffForm.perKmIdr}
                      onChange={(e) =>
                        setTariffForm((prev) => ({
                          ...prev,
                          perKmIdr: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  {tariffPreviewFare !== null && (
                    <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      Contoh dengan tarif ini: {tariffPreviewKm} km →{" "}
                      {formatRupiah(tariffPreviewFare)}.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveTariff}
                    disabled={saving}
                    className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Menyimpan…" : "Simpan tarif"}
                  </button>
                </div>
              )}
            </section>
          )}

          <div>
            <Link href="/" className="text-sm text-slate-600 underline">
              Kembali ke beranda
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
