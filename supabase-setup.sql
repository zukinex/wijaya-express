-- Wijaya Express — setup tabel database
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → paste semua ini → Run
-- Project: https://xttoychgwkythekluqzt.supabase.co (Singapore, Free)

create type order_service as enum ('ride', 'parcel', 'food');
create type order_status as enum
  ('created', 'accepted', 'picked_up', 'delivered', 'completed', 'cancelled');

create table profiles (
  id uuid primary key references auth.users(id),
  role text not null check (role in ('driver', 'admin')),
  display_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key references profiles(id),
  vehicle_plate text not null,
  vehicle_model text,
  is_online boolean not null default false,
  is_active boolean not null default true,
  current_lat double precision,
  current_lng double precision,
  last_seen_at timestamptz
);

create table tariffs (
  id int primary key default 1 check (id = 1),
  base_fare_idr int not null default 6000,
  base_distance_km numeric not null default 2,
  per_km_idr int not null default 3500,
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  service order_service not null,
  status order_status not null default 'created',
  passenger_name text not null,
  passenger_phone text not null,
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  distance_km numeric not null,
  fare_idr int not null,
  food_details text,
  food_price_idr int,
  driver_id uuid references drivers(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by text check (cancelled_by in ('passenger', 'driver', 'admin'))
);

-- Tarif awal: Rp 6.000 / 2 km pertama + Rp 3.500 / km berikutnya
insert into tariffs (id, base_fare_idr, base_distance_km, per_km_idr)
values (1, 6000, 2, 3500)
on conflict (id) do nothing;

-- Izin akses (tabel baru dari SQL tidak otomatis bisa dibaca anon key).
-- Row Level Security + policy per-role ada di supabase-rls.sql (Fase 3);
-- jalankan file itu setelah file ini.
grant select on public.tariffs to anon, authenticated;
grant select, insert on public.orders to anon, authenticated;
grant update on public.orders to authenticated;
grant select on public.drivers to anon, authenticated;
grant update on public.drivers to authenticated;
grant select on public.profiles to anon, authenticated;

-- Realtime: supaya halaman status pesanan (/order/[id]) dan aplikasi
-- driver mendapat update instan (bukan hanya lewat polling 15 detik),
-- daftarkan tabel orders ke publikasi supabase_realtime.
-- (Jalankan sekali; aman diulang.)
alter publication supabase_realtime add table public.orders;
