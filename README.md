# Wijaya Express

Ojek lokal **Kota Madiun** — antar orang, barang, dan makanan. Bayar tunai.
Satu operator (admin), 5 driver saat peluncuran. Aplikasi web yang bisa
di-install di HP (PWA), backend Supabase. Tanpa Google Maps, tanpa API
berbayar, tanpa Play Store.

## Layanan

| Layanan | Keterangan |
| --- | --- |
| Antar Orang | Naik ojek motor dalam Kota Madiun. |
| Antar Barang | Kirim paket/barang dalam kota. |
| Antar Makanan | Tulis warung + pesanan (teks bebas); driver belikan dan antarkan. |

## Tarif (sama untuk semua layanan)

- **Rp 6.000** untuk 2 km pertama
- **+Rp 3.500** per km berikutnya (per km yang dimulai, dibulatkan ke atas)

Rumus: `tarif = 6000 + max(0, ceil(jarakKm - 2)) × 3500`. Contoh: 5 km →
Rp 16.500. Untuk Antar Makanan, tarif di atas adalah **ongkir saja** —
harga makanan dibayar terpisah secara tunai (total = harga makanan +
ongkir). Driver menalangi pembelian di warung.

## Stack

- Next.js 15 + React 19 + TypeScript strict, Tailwind CSS v3, Vitest
- Supabase (Postgres + Realtime + Auth) — free tier
- Leaflet + OpenStreetMap, Nominatim (geocoding), OSRM (routing, dengan
  fallback Haversine)
- PWA (web manifest + service worker) — installable, tanpa Play Store
- Deploy: Vercel (free tier)

## Cara jalan

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # Vitest
npm run type-check
npm run build
```

## Supabase setup (TODO — dilakukan operator)

Aplikasi ini **bisa di-build dan dijalankan tanpa Supabase**, tapi
pemesanan nonaktif sampai backend dikonfigurasi (halaman utama menampilkan
"Backend belum dikonfigurasi").

1. Buat akun gratis di https://supabase.com lalu buat project baru.
2. Di SQL Editor, jalankan skema dari
   `.kiro/specs/wijaya-express/design.md` (tabel `profiles`, `drivers`,
   `tariffs`, `orders`) dan isi baris tarif (6000, 2, 3500).
3. Salin `.env.example` ke `.env.local` dan isi:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project Settings → API → Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API → anon key)
4. Di Vercel (saat deploy), isi kedua variabel yang sama di Project
   Settings → Environment Variables.
5. Buat akun driver (5 orang) + admin lewat Supabase Auth; RLS mengikuti
   sketsa di `design.md` (ditegakkan di Phase 3–4).

Jangan pernah memasukkan service-role key ke aplikasi — hanya anon key
yang dipakai di browser.

## Status

- [x] Phase 1 — Spec + scaffold (spec EARS, `src/lib/fare.ts` +
      `src/lib/supabase.ts` + unit test, home shell)
- [ ] Phase 2 — Tarif + UI pemesanan (geo, routing, form order, status page)
- [ ] Phase 3 — Aplikasi driver + dispatch realtime (first-accept)
- [ ] Phase 4 — Admin (order, driver, tarif)
- [ ] Phase 5 — PWA + testing end-to-end + launch

Detail lengkap: `.kiro/specs/wijaya-express/` (`requirements.md`,
`design.md`, `tasks.md`).

## Lisensi

MIT — lihat `LICENSE`.
