-- Wijaya Express — seed profil + driver (Fase 3)
-- Cara pakai:
--   1) Buat 6 akun auth dulu di dashboard (Authentication → Users →
--      Add user, centang "Auto Confirm User"). Lihat test-accounts.md
--      untuk email + password tiap akun.
--   2) Klik tiap user di dashboard, salin UUID-nya (kolom "User UID").
--   3) Ganti placeholder di bawah (ADMIN_UUID, DRIVER1_UUID, dst.)
--      dengan UUID asli dari dashboard.
--   4) SQL Editor → New query → paste file ini → Run.
-- Berjalan sebagai postgres di SQL Editor, jadi RLS tidak menghalangi.
-- Aman diulang (ON CONFLICT ... DO UPDATE).

-- ADMIN — admin@wijayaexpress.test
insert into public.profiles (id, role, display_name, phone)
values ('ADMIN_UUID', 'admin', 'Operator Wijaya', '+6281234567800')
on conflict (id) do update
  set role = 'admin',
      display_name = excluded.display_name,
      phone = excluded.phone;

-- DRIVER 1 — driver1@wijayaexpress.test — Budi Santoso
insert into public.profiles (id, role, display_name, phone)
values ('DRIVER1_UUID', 'driver', 'Budi Santoso', '+6281234567801')
on conflict (id) do update
  set role = 'driver',
      display_name = excluded.display_name,
      phone = excluded.phone;
insert into public.drivers (id, vehicle_plate, vehicle_model, is_online, is_active)
values ('DRIVER1_UUID', 'AE 1234 AA', 'Honda Beat', false, true)
on conflict (id) do update
  set vehicle_plate = excluded.vehicle_plate,
      vehicle_model = excluded.vehicle_model,
      is_active = excluded.is_active;

-- DRIVER 2 — driver2@wijayaexpress.test — Agus Prasetyo
insert into public.profiles (id, role, display_name, phone)
values ('DRIVER2_UUID', 'driver', 'Agus Prasetyo', '+6281234567802')
on conflict (id) do update
  set role = 'driver',
      display_name = excluded.display_name,
      phone = excluded.phone;
insert into public.drivers (id, vehicle_plate, vehicle_model, is_online, is_active)
values ('DRIVER2_UUID', 'AE 2345 BB', 'Honda Vario', false, true)
on conflict (id) do update
  set vehicle_plate = excluded.vehicle_plate,
      vehicle_model = excluded.vehicle_model,
      is_active = excluded.is_active;

-- DRIVER 3 — driver3@wijayaexpress.test — Slamet Riyadi
insert into public.profiles (id, role, display_name, phone)
values ('DRIVER3_UUID', 'driver', 'Slamet Riyadi', '+6281234567803')
on conflict (id) do update
  set role = 'driver',
      display_name = excluded.display_name,
      phone = excluded.phone;
insert into public.drivers (id, vehicle_plate, vehicle_model, is_online, is_active)
values ('DRIVER3_UUID', 'AE 3456 CC', 'Yamaha NMax', false, true)
on conflict (id) do update
  set vehicle_plate = excluded.vehicle_plate,
      vehicle_model = excluded.vehicle_model,
      is_active = excluded.is_active;

-- DRIVER 4 — driver4@wijayaexpress.test — Joko Susilo
insert into public.profiles (id, role, display_name, phone)
values ('DRIVER4_UUID', 'driver', 'Joko Susilo', '+6281234567804')
on conflict (id) do update
  set role = 'driver',
      display_name = excluded.display_name,
      phone = excluded.phone;
insert into public.drivers (id, vehicle_plate, vehicle_model, is_online, is_active)
values ('DRIVER4_UUID', 'AE 4567 DD', 'Honda Scoopy', false, true)
on conflict (id) do update
  set vehicle_plate = excluded.vehicle_plate,
      vehicle_model = excluded.vehicle_model,
      is_active = excluded.is_active;

-- DRIVER 5 — driver5@wijayaexpress.test — Bambang Sutrisno
insert into public.profiles (id, role, display_name, phone)
values ('DRIVER5_UUID', 'driver', 'Bambang Sutrisno', '+6281234567805')
on conflict (id) do update
  set role = 'driver',
      display_name = excluded.display_name,
      phone = excluded.phone;
insert into public.drivers (id, vehicle_plate, vehicle_model, is_online, is_active)
values ('DRIVER5_UUID', 'AE 5678 EE', 'Yamaha Aerox', false, true)
on conflict (id) do update
  set vehicle_plate = excluded.vehicle_plate,
      vehicle_model = excluded.vehicle_model,
      is_active = excluded.is_active;
