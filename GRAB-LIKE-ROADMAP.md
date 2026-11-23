# Wijaya Express — Roadmap "Rasa Grab"

Dibuat 2026-11-23 atas permintaan operator ("modif kayak apk Grab gimana?").
Bahasa: Indonesia. Stack tetap: Next.js 15 + Supabase + Vercel + PWA, peta gratis
(Leaflet/OSM + Nominatim + OSRM). Area: Kabupaten Nganjuk + Jombang. Tarif:
Rp 6.000 / 2 km pertama + Rp 3.500 / km berikutnya, tunai, 5 driver.

## Keadaan sekarang (apa yang sudah ada)

Sudah jadi (Phase 1–3 + PWA, live di wijaya-express.vercel.app):
- Order ride / parcel / food (tamu, tanpa login), pratinjau tarif live.
- Dispatch realtime: driver online lihat order baru, terima dengan atomic
  first-accept (cuma satu yang menang).
- Driver app: online/offline, order aktif (picked up / delivered / tunai
  diterima), food-price step, link navigasi ke aplikasi peta.
- Status order live buat penumpang (Realtime), PWA installable.
- Admin: BELUM (Phase 4, task 15–16). Tes 2 HP (task 14) BELUM.

## Phase 0 — WAJIB DULUAN: perbaiki tombol order (bug terbuka)

**Status 2026-11-23: "Buat Pesanan — Bayar Tunai" DISABLED di situs live.**
Banner: "Backend belum dikonfigurasi". Penyebab terverifikasi: build Vercel
12:22 WIB 2026-11-22 dibuat TANPA `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (tidak ada URL Supabase di JS hasil build).

Perbaikan (aksi operator, Muse tidak punya akses Vercel): Vercel → project
wijaya-express → Settings → Environment Variables → pastikan kedua variabel
ada dengan scope **Production** → Deployments → Redeploy. Setelah itu
verifikasi ulang lewat browser langsung (banner muncul hanya setelah
hydration, jangan cek lewat fetch teks).

**Jangan bangun fitur Grab di atas tombol order yang rusak.**

---

## Phase A — "Rasa Grab" dengan stack sekarang (GRATIS, tanpa biaya baru)

Diurutkan dari yang paling terasa buat penumpang. Usaha kasar: K = kecil
(<1 hari), S = sedang (1–3 hari), B = besar (3–7 hari). Semua dikerjakan
Muse, operator cuma uji di HP.

### A1. Driver terdekat kelihatan di peta + ETA (paling Grab)
- **Grab-nya:** sebelum order, penumpang lihat motor driver di sekitar + "2 menit lagi".
- **Wijaya sekarang:** tidak ada — penumpang tidak tahu ada driver di dekatnya atau tidak.
- **Yang dibangun:** driver online kirim posisi GPS tiap ~10 detik ke tabel
  `driver_locations` (Supabase Realtime); halaman `/pesan` tampilkan marker
  driver online di peta Leaflet + estimasi jarak/waktu ke titik jemput.
- **Biaya:** Rp 0 (Realtime + GPS browser sudah ada).
- **Usaha:** S. Catatan privasi: posisi driver hanya tampil selama online,
  dan hanya posisi kasar di peta (Req 11).

### A2. Lacak driver saat order jalan
- **Grab-nya:** setelah driver terima, penumpang lihat motornya bergerak di peta.
- **Wijaya sekarang:** status cuma teks (accepted → picked up → delivered),
  tanpa posisi.
- **Yang dibangun:** halaman status `/order/[id]` tampilkan peta live dengan
  marker driver (pakai `driver_locations` dari A1) sampai status delivered.
  Posisi berhenti dibagikan setelah order selesai/dibatalkan (Req 11).
- **Biaya:** Rp 0. **Usaha:** S (bergantung A1).

### A3. Rating & ulasan driver
- **Grab-nya:** bintang 1–5 + komentar setelah order selesai.
- **Wijaya sekarang:** tidak ada.
- **Yang dibangun:** tabel `ratings` (order_id, driver_id, bintang, komentar);
  setelah completed, halaman status minta rating; profil driver tampilkan
  rata-rata bintang. Admin bisa lihat driver bermasalah.
- **Biaya:** Rp 0. **Usaha:** K–S.

### A4. Riwayat order penumpang
- **Grab-nya:** daftar order lama + pesan ulang dengan satu ketuk.
- **Wijaya sekarang:** tidak ada — order cuma ada di halaman status saat itu.
- **Yang dibangun:** simpan daftar order_id di localStorage browser penumpang;
  halaman "Order saya" tampilkan riwayat + tombol "Pesan lagi" (isi ulang form
  dari order lama).
- **Biaya:** Rp 0. **Usaha:** K.

### A5. Promo / voucher
- **Grab-nya:** kode promo (gratis ongkir, diskon Rp X).
- **Wijaya sekarang:** tidak ada.
- **Yang dibangun:** tabel `vouchers` (kode, jenis: gratis-ongkir/diskon Rp,
  kuota, berlaku sampai); kolom kode di form order; tarif dihitung setelah
  voucher. Admin kelola dari halaman admin (Phase 4).
- **Biaya:** Rp 0 (diskonnya ditanggung operator). **Usaha:** S.
- **Saran soft launch:** gratis ongkir 100 order pertama (sudah direncanakan
  2026-11-23) — voucher adalah cara formalnya.

### A6. Alamat favorit / tempat tersimpan
- **Grab-nya:** Rumah, Kantor, Kos — sekali ketuk isi alamat.
- **Wijaya sekarang:** ketik alamat tiap order.
- **Yang dibangun:** simpan alamat favorit di localStorage (nama + titik);
  form order tawarkan pilihan cepat.
- **Biaya:** Rp 0. **Usaha:** K.

### A7. Chat penumpang–driver
- **Grab-nya:** chat + telepon dalam aplikasi (nomor disamarkan).
- **Wijaya sekarang:** penumpang lihat nomor HP driver di halaman status,
  hubungi manual.
- **Yang dibangun (gratis, sekarang):** tombol "Chat WA driver" di halaman
  status — deep link `wa.me/<nomor>` (langsung buka WhatsApp, tanpa simpan
  nomor). Chat in-app sungguhan (tabel `messages` + Realtime) = usaha B,
  ditunda sampai ada kebutuhan nyata.
- **Biaya:** Rp 0 (WA link). **Usaha:** K (link) / B (in-app).

### A8. Halaman pendapatan driver
- **Grab-nya:** ringkasan penghasilan harian/mingguan + riwayat trip.
- **Wijaya sekarang:** driver tidak lihat total pendapatannya.
- **Yang dibangun:** halaman `/driver/pendapatan`: total order selesai,
  total tarif, total uang makanan yang ditalangi, per hari/minggu (query
  tabel `orders` milik driver itu).
- **Biaya:** Rp 0. **Usaha:** K–S. Penting nanti saat komisi 8% jalan
  (keputusan 2026-11-23: komisi OFF saat launch, 8% belakangan).

### A9. Notifikasi push (PWA)
- **Grab-nya:** "Driver ditemukan", "Driver sudah sampai", "Order selesai".
- **Wijaya sekarang:** tidak ada — penumpang harus buka halaman status.
- **Yang dibangun:** Web Push (VAPID) + service worker sudah ada; endpoint
  kirim notifikasi saat status order berubah (via Supabase Database Webhook
  → Edge Function / Vercel Function). Penumpang izinkan notifikasi sekali.
- **Biaya:** Rp 0. **Usaha:** S. Batasan: di iPhone, push PWA baru jalan di
  iOS 16.4+ dan hanya kalau app sudah di-add ke Home Screen.

---

## Phase B — Pembayaran digital (BUTUH BIAYA + REGISTRASI)

Keputusan sekarang: **tunai saja** (Req 6). Digital dibahas di sini supaya
jelas biayanya — bukan untuk dibangun sekarang.

### B1. QRIS (bayar pakai QR, semua e-wallet/bank)
- **Grab-nya:** GrabPay / QRIS.
- **Yang dibangun:** daftar merchant di payment gateway (Midtrans atau Xendit),
  buat QR per order, penumpang scan + bayar, gateway kabari server (webhook)
  → status order jadi "dibayar".
- **Biaya:** sekitar **0,7% per transaksi** (cek tarif terbaru di situs
  gateway — tarif bisa berubah). Daftar merchant butuh KTP + rekening bank
  (badan usaha lebih mudah, tapi perorangan bisa). Tidak ada biaya bulanan
  di paket dasar.
- **Usaha:** B (webhook + status bayar + rekonsiliasi). **Syarat:** komisi
  dan alur tunai sudah jalan dulu — jangan campur dua perubahan besar.

### B2. Saldo / dompet penumpang (opsional, belakangan)
- Top-up saldo lalu potong per order. Butuh: tabel `wallets`, top-up via
  QRIS (B1), dan aturan refund. Usaha B. Hanya masuk akal kalau order
  sudah ramai — bukan untuk launch.

---

## Phase C — Aplikasi native (Play Store)

### C1. APK dari PWA (jalur termurah)
- Bungkus PWA jadi APK: **TWA (Trusted Web Activity)** via Bubblewrap, atau
  **Capacitor**. Tidak tulis ulang aplikasi — situs yang sama, dibungkus.
- **Biaya:** akun developer Google Play **$25 sekali** (~Rp 400rb, unlimited
  aplikasi). Akun personal baru wajib **closed test: 12 tester selama 14
  hari berturut-turut per aplikasi** sebelum production (aturan Google).
- **Usaha:** S (bangun + submit + urus closed test).
- **Catatan:** PWA sekarang sudah installable gratis dari browser — Play
  Store itu soal distribusi/kepercayaan, bukan fungsi. Prioritas di bawah
  Phase A.

### C2. Push + lokasi background penuh
- Aplikasi native bisa: push notification yang lebih andal + posisi driver
  tetap terkirim walau app di background (penting buat A1/A2 yang akurat).
- **Biaya:** Rp 0 (selain $25 Play Store di C1). **Usaha:** S (sesudah C1).

---

## Yang TIDAK perlu ditiru dari Grab (belum perlu di skala lokal)

- **Surge pricing (tarif naik saat ramai):** 5 driver + 2 kabupaten — harga
  tetap Rp 6.000/2 km + Rp 3.500/km adalah keunggulan ("ojek lokal, ongkir
  mulai Rp 6.000"), bukan kekurangan. Tarif dinamis bikin penumpang bingung.
- **Multi-stop / antar banyak titik:** tambah kalau ada permintaan nyata.
- **GrabMart / banyak kategori:** food + ride + parcel sudah cukup.
- **Asuransi / perlindungan trip:** butuh kerja sama asuransi — nanti.
- **Iklan dalam aplikasi:** bukan prioritas.

---

## Urutan yang disarankan

| # | Apa | Fase | Biaya | Usaha |
|---|-----|------|-------|-------|
| 0 | Perbaiki tombol order (env var Vercel) | 0 | Rp 0 | Operator (15 mnt) |
| 1 | Admin view (task 15–16, Phase 4) — perlu buat kelola driver/tarif/voucher | 4 | Rp 0 | S |
| 2 | A1 Driver di peta + ETA | A | Rp 0 | S |
| 3 | A2 Lacak driver live | A | Rp 0 | S |
| 4 | A7 Chat WA driver (deep link) | A | Rp 0 | K |
| 5 | A3 Rating driver | A | Rp 0 | K–S |
| 6 | A8 Pendapatan driver | A | Rp 0 | K–S |
| 7 | A4 Riwayat order + pesan lagi | A | Rp 0 | K |
| 8 | A5 Voucher (gratis ongkir 100 order pertama) | A | Diskon ditanggung operator | S |
| 9 | A6 Alamat favorit | A | Rp 0 | K |
| 10 | A9 Notifikasi push | A | Rp 0 | S |
| 11 | B1 QRIS (kalau order sudah ramai) | B | ~0,7%/trx + registrasi | B |
| 12 | C1 Play Store APK (kalau mau distribusi toko) | C | $25 sekali | S |

Total Phase A: semua gratis, dikerjakan bertahap. Perkiraan keseluruhan
Phase A: ~1–2 minggu kerja Muse (dengan uji operator di HP tiap fitur).

## Keputusan yang masih terbuka (tanya operator)

1. **Mulai dari mana?** Rekomendasi: 0 → 1 → 2 → 3, tapi operator boleh
   pilih fitur mana duluan.
2. **Food front-money:** driver talangi uang makanan di warung, penumpang
   bayar tunai saat antar (sudah di spek, belum dikonfirmasi eksplisit).
3. **Komisi:** tetap 0% saat launch, 8% belakangan, driver diberitahu di
   awal (keputusan 2026-11-23). Wallet/deposit driver ikut menyala saat
   komisi jalan — bukan sebelum.
4. **QRIS:** mau didaftar sekarang atau tunggu order ramai? (Butuh KTP +
   rekening; badan usaha lebih mudah.)
