import Link from "next/link";
import {
  BASE_DISTANCE_KM,
  BASE_FARE_IDR,
  PER_KM_IDR,
  calculateFare,
  formatRupiah,
} from "@/lib/fare";
import { getSupabaseConfigStatus } from "@/lib/supabase";

const SERVICES = [
  {
    name: "Antar Orang",
    description:
      "Naik ojek motor ke mana saja di Kota Madiun. Pesan, driver datang, bayar tunai.",
  },
  {
    name: "Antar Barang",
    description:
      "Kirim paket atau barang dalam kota. Driver ambil di lokasi, antar sampai tujuan.",
  },
  {
    name: "Antar Makanan",
    description:
      "Tulis warung dan pesananmu — driver belikan dan antarkan. Bayar tunai: harga makanan + ongkir.",
  },
];

export default function HomePage() {
  const backend = getSupabaseConfigStatus();
  const exampleKm = 5;
  const exampleFare = calculateFare(exampleKm);

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold">Wijaya Express</h1>
        <p className="mt-2 text-slate-600">
          Ojek lokal Kota Madiun — antar orang, barang, dan makanan. Bayar
          tunai.
        </p>
      </header>

      {!backend.configured && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Backend belum dikonfigurasi — pemesanan belum bisa dilakukan.
          Operator perlu menghubungkan Supabase terlebih dahulu (lihat
          README, bagian “Supabase setup”).
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/pesan"
          className="inline-block rounded-lg bg-green-600 px-6 py-3 font-semibold text-white"
        >
          Pesan Sekarang
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Layanan</h2>
        <div className="mt-3 grid gap-3">
          {SERVICES.map((service) => (
            <article
              key={service.name}
              className="rounded-lg border px-4 py-3"
            >
              <h3 className="font-semibold">{service.name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {service.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-lg border bg-slate-50 px-4 py-3">
        <h2 className="text-xl font-semibold">Tarif</h2>
        <p className="mt-2 text-sm text-slate-700">
          {formatRupiah(BASE_FARE_IDR)} untuk {BASE_DISTANCE_KM} km pertama,
          +{formatRupiah(PER_KM_IDR)} per km berikutnya.
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Contoh: {exampleKm} km → {formatRupiah(exampleFare)}. Untuk Antar
          Makanan, tarif di atas adalah ongkir saja — harga makanan dibayar
          terpisah secara tunai saat antar.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Cara pesan</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Pilih layanan dan isi alamat jemput + tujuan.</li>
          <li>Lihat tarif, lalu konfirmasi pesanan.</li>
          <li>Driver terdekat menerima pesananmu.</li>
          <li>Bayar tunai saat sampai.</li>
        </ol>
        <p className="mt-4 text-sm text-slate-600">
          Driver Wijaya Express?{" "}
          <Link href="/driver" className="font-semibold underline">
            Masuk ke aplikasi driver
          </Link>
        </p>
      </section>
    </main>
  );
}
