/**
 * Order status page (Req 5, Req 6) — guest, no login.
 *
 * Shows the live status, assigned driver (name + phone) once accepted,
 * the fare, and for food orders the total cash due (food price + delivery
 * fee, once the driver fills the food price in).
 *
 * Live updates: Supabase Realtime subscription on the order row, plus a
 * 15-second polling fallback (Realtime only fires instantly when the
 * `orders` table is in the `supabase_realtime` publication — see
 * supabase-setup.sql notes; polling keeps the page correct either way).
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatRupiah } from "@/lib/fare";
import { formatDistance } from "@/lib/geo";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  SERVICE_LABELS,
  STATUS_LABELS,
  getOrderById,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders";

const STATUS_ORDER: OrderStatus[] = [
  "created",
  "accepted",
  "picked_up",
  "delivered",
  "completed",
];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderStatusPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const backendConfigured = isSupabaseConfigured();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !id) return;
    const row = await getOrderById(client, id);
    if (!row) {
      setNotFound(true);
      setOrder(null);
    } else {
      setOrder(row);
      setNotFound(false);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!backendConfigured) {
      setLoading(false);
      setError("Backend belum dikonfigurasi.");
      return;
    }
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;

    fetchOrder();
    const channel = client
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${id}`,
        },
        () => {
          fetchOrder();
        },
      )
      .subscribe();
    // Polling fallback: keeps the page correct even when the table is
    // not in the supabase_realtime publication yet.
    const poll = setInterval(fetchOrder, 15000);
    return () => {
      clearInterval(poll);
      client.removeChannel(channel);
    };
  }, [backendConfigured, fetchOrder, id]);

  const isTerminal =
    order?.status === "completed" || order?.status === "cancelled";
  const totalCash =
    order?.service === "food" && order.food_price_idr !== null
      ? order.food_price_idr + order.fare_idr
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold">Status Pesanan</h1>
        <p className="mt-1 text-sm text-slate-600">
          ID pesanan: <span className="font-mono text-xs">{id}</span>
        </p>
      </header>

      {!backendConfigured && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Backend belum dikonfigurasi — status pesanan tidak bisa dimuat.
        </div>
      )}

      {loading && (
        <p className="mt-6 text-sm text-slate-600">Memuat pesanan…</p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {!loading && notFound && (
        <div className="mt-6 rounded-lg border px-4 py-3 text-sm">
          <p className="font-semibold">Pesanan tidak ditemukan.</p>
          <p className="mt-1 text-slate-600">
            Periksa lagi ID pesanannya, atau buat pesanan baru.
          </p>
          <Link
            href="/pesan"
            className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 font-semibold text-white"
          >
            Buat Pesanan Baru
          </Link>
        </div>
      )}

      {!loading && order && (
        <div className="mt-6 space-y-4">
          <section className="rounded-lg border px-4 py-3">
            <p className="text-sm text-slate-500">
              {SERVICE_LABELS[order.service]} •{" "}
              {formatDistance(order.distance_km)}
            </p>
            <p className="mt-1 text-xl font-bold">
              {STATUS_LABELS[order.status]}
            </p>
            {!isTerminal && (
              <p className="mt-1 text-sm text-slate-600">
                {order.status === "created"
                  ? "Driver sedang diberitahu — mohon tunggu sebentar."
                  : "Driver sudah menerima pesananmu."}
              </p>
            )}
            <ol className="mt-3 space-y-1 text-sm text-slate-700">
              <li>Dibuat: {formatTime(order.created_at)}</li>
              {order.accepted_at && (
                <li>Diterima driver: {formatTime(order.accepted_at)}</li>
              )}
              {order.picked_up_at && (
                <li>Dijemput / dibeli: {formatTime(order.picked_up_at)}</li>
              )}
              {order.delivered_at && (
                <li>Sampai tujuan: {formatTime(order.delivered_at)}</li>
              )}
              {order.completed_at && (
                <li>Selesai: {formatTime(order.completed_at)}</li>
              )}
              {order.cancelled_at && (
                <li>
                  Dibatalkan: {formatTime(order.cancelled_at)}
                  {order.cancel_reason
                    ? ` — ${order.cancel_reason}`
                    : ""}
                </li>
              )}
            </ol>
          </section>

          {order.driver && (
            <section className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <h2 className="font-semibold text-green-900">Driver kamu</h2>
              <p className="mt-1 text-sm text-green-900">
                {order.driver.display_name}
              </p>
              <a
                href={`tel:${order.driver.phone}`}
                className="mt-1 inline-block text-sm font-semibold text-green-800 underline"
              >
                {order.driver.phone}
              </a>
            </section>
          )}

          <section className="rounded-lg border px-4 py-3 text-sm">
            <h2 className="font-semibold">Rute</h2>
            <p className="mt-1 text-slate-700">
              Jemput: {order.pickup_address}
            </p>
            <p className="mt-1 text-slate-700">
              Tujuan: {order.dropoff_address}
            </p>
            {order.food_details && (
              <p className="mt-2 whitespace-pre-line rounded bg-slate-50 px-3 py-2 text-slate-700">
                {order.food_details}
              </p>
            )}
          </section>

          <section className="rounded-lg border bg-slate-50 px-4 py-3">
            <h2 className="font-semibold">Bayar tunai</h2>
            <p className="mt-1 text-sm text-slate-700">
              Ongkir: {formatRupiah(order.fare_idr)}
            </p>
            {order.service === "food" && (
              <p className="mt-1 text-sm text-slate-700">
                Harga makanan:{" "}
                {order.food_price_idr !== null
                  ? formatRupiah(order.food_price_idr)
                  : "menyusul (driver isi setelah beli di warung)"}
              </p>
            )}
            <p className="mt-2 text-lg font-bold">
              Total tunai:{" "}
              {totalCash !== null
                ? formatRupiah(totalCash)
                : formatRupiah(order.fare_idr)}
            </p>
            {order.service === "food" && totalCash === null && (
              <p className="mt-1 text-xs text-slate-500">
                Total akhir = harga makanan + ongkir, setelah driver
                membeli makanan di warung.
              </p>
            )}
          </section>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchOrder();
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Perbarui status
            </button>
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Kembali ke beranda
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
