-- Wijaya Express — Row Level Security (Fase 3)
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → paste semua
-- ini → Run. Jalankan SETELAH supabase-setup.sql. Aman diulang
-- (DROP POLICY IF EXISTS / CREATE OR REPLACE).
--
-- Yang dilindungi:
--   * Penumpang (anon): hanya boleh MEMBUAT order (status 'created',
--     tanpa driver) dan MEMBACA satu order lewat ID-nya (halaman status).
--     Perlindungan baca di sini adalah ID order berupa UUID acak yang
--     tidak bisa ditebak; aplikasi hanya pernah mengambil order
--     berdasarkan ID. Jangan mengandalkan ini untuk data sensitif lain.
--   * Driver (authenticated, role 'driver'): lihat order baru (status
--     'created') + order miliknya sendiri; ubah hanya order miliknya
--     (terima / jemput / antar / tunai diterima / batal), dengan guard
--     status di aplikasi (UPDATE ... WHERE status = '<status lama>').
--   * Admin (authenticated, role 'admin'): baca semua order/driver/
--     tarif; ubah driver + tarif (editor tarif di Fase 4).
--   * Tidak ada peran yang boleh MENGHAPUS baris (tidak ada policy
--     DELETE di mana pun — hapus hanya bisa lewat SQL Editor / dashboard).
--   * Penumpang TIDAK bisa membatalkan sendiri lewat aplikasi (anon
--     tidak punya policy UPDATE) — pembatalan penumpang ditangani lewat
--     driver/admin. Ini disengaja.
--
-- Setelah RLS aktif, alur penumpang tetap jalan: anon INSERT order
-- (status 'created', driver_id null) dan anon SELECT order by id.
-- Akun driver + admin harus sudah dibuat sebelum aplikasi driver bisa
-- dipakai (lihat test-accounts.md + supabase-seed-drivers.sql).

-- ---------------------------------------------------------------------------
-- Helper: cek peran user yang sedang login (auth.uid()).
-- SECURITY DEFINER supaya fungsi ini bisa membaca tabel profiles walau
-- RLS aktif di profiles (policy di bawah memanggil fungsi ini).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver'
  );
$$;

-- Apakah driver ini sedang mengerjakan order aktif (diterima / dijemput /
-- diantar)? Dipakai policy anon untuk menampilkan nama + HP driver di
-- halaman status pesanan, tanpa membuka lokasi semua driver.
create or replace function public.driver_has_active_job(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders
    where driver_id = p_driver_id
      and status in ('accepted', 'picked_up', 'delivered')
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_driver() to anon, authenticated;
grant execute on function public.driver_has_active_job(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aktifkan RLS di keempat tabel.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.tariffs enable row level security;
alter table public.orders enable row level security;

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------

-- Penumpang (anon): baca satu order lewat ID-nya (halaman status).
drop policy if exists "anon_select_order_by_id" on public.orders;
create policy "anon_select_order_by_id" on public.orders
  for select to anon
  using (true);

-- Penumpang (anon): buat order baru. Hanya boleh membuat order berstatus
-- 'created' tanpa driver — tidak bisa membuat order yang sudah "diambil".
drop policy if exists "anon_insert_order" on public.orders;
create policy "anon_insert_order" on public.orders
  for insert to anon
  with check (status = 'created' and driver_id is null);

-- Driver: lihat order baru (status 'created') + order miliknya sendiri.
-- Admin: lihat semua order.
drop policy if exists "driver_select_orders" on public.orders;
create policy "driver_select_orders" on public.orders
  for select to authenticated
  using (
    (status = 'created' and public.is_driver())
    or driver_id = auth.uid()
    or public.is_admin()
  );

-- Driver: ubah order — terima order baru (atomic first-accept) atau ubah
-- status order miliknya (picked_up / delivered / completed / cancel).
-- WITH CHECK memastikan driver tidak bisa memindahkan order ke driver lain.
-- Catatan: policy ini tidak bisa membedakan kolom yang diubah; guard
-- transisi status ada di aplikasi (UPDATE ... WHERE status = '<lama>').
drop policy if exists "driver_update_orders" on public.orders;
create policy "driver_update_orders" on public.orders
  for update to authenticated
  using (
    (status = 'created' and public.is_driver())
    or driver_id = auth.uid()
    or public.is_admin()
  )
  with check (
    (driver_id = auth.uid() and public.is_driver())
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- TARIFFS
-- ---------------------------------------------------------------------------

-- Tarif: semua peran boleh baca — penumpang butuh tarif untuk menghitung
-- ongkir sebelum memesan.
drop policy if exists "anyone_select_tariffs" on public.tariffs;
create policy "anyone_select_tariffs" on public.tariffs
  for select to anon, authenticated
  using (true);

-- Tarif: hanya admin boleh mengubah (editor tarif di Fase 4).
drop policy if exists "admin_update_tariffs" on public.tariffs;
create policy "admin_update_tariffs" on public.tariffs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- DRIVERS
-- ---------------------------------------------------------------------------

-- Penumpang (anon): hanya bisa melihat driver yang sedang mengerjakan
-- order aktif — ini yang dipakai join di halaman status pesanan (nama +
-- nomor HP driver setelah order diterima). Lokasi driver yang offline /
-- belum ada order TIDAK terlihat oleh anon.
drop policy if exists "anon_select_active_drivers" on public.drivers;
create policy "anon_select_active_drivers" on public.drivers
  for select to anon
  using (public.driver_has_active_job(id));

-- Driver: lihat barisnya sendiri. Admin: lihat semua driver.
drop policy if exists "driver_select_own_row" on public.drivers;
create policy "driver_select_own_row" on public.drivers
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Driver: ubah barisnya sendiri (toggle online, update lokasi).
-- Admin: ubah baris driver mana pun (switch aktif/nonaktif di Fase 4).
drop policy if exists "driver_update_own_row" on public.drivers;
create policy "driver_update_own_row" on public.drivers
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Admin: tambah driver baru lewat aplikasi (Fase 4).
drop policy if exists "admin_insert_drivers" on public.drivers;
create policy "admin_insert_drivers" on public.drivers
  for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------

-- Penumpang (anon): hanya profil driver yang sedang mengerjakan order
-- aktif (join dari halaman status pesanan). Profil admin tidak terlihat.
drop policy if exists "anon_select_active_driver_profiles" on public.profiles;
create policy "anon_select_active_driver_profiles" on public.profiles
  for select to anon
  using (public.driver_has_active_job(id));

-- Driver/admin: lihat profil sendiri. Admin: lihat semua profil.
drop policy if exists "user_select_own_profile" on public.profiles;
create policy "user_select_own_profile" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Driver/admin: ubah profil sendiri (nama / nomor HP).
-- Admin: ubah profil siapa pun.
drop policy if exists "user_update_own_profile" on public.profiles;
create policy "user_update_own_profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Admin: tambah profil baru (saat mendaftarkan driver lewat aplikasi,
-- Fase 4).
drop policy if exists "admin_insert_profiles" on public.profiles;
create policy "admin_insert_profiles" on public.profiles
  for insert to authenticated
  with check (public.is_admin());
