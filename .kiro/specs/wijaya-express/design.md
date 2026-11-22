# Design — Wijaya Express

## Overview

Wijaya Express is a local ride-hailing app for Kabupaten Nganjuk dan Jombang only. One
operator (admin), 5 drivers at launch, 3 services (ride, parcel, food),
cash payment. The app is a Next.js PWA on Vercel, backed by Supabase
(Postgres + Realtime + Auth). No Google Maps, no paid APIs, no Play Store
app.

```
Passenger (guest, no login)        Driver (Supabase Auth)          Admin (Supabase Auth)
┌─────────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│ Pick service            │       │ Online/offline toggle│       │ All orders           │
│ Enter pickup + dest     │       │ New orders (realtime)│       │ Driver management    │
│ See fare (tariff)       ├──────►│ Accept (first wins)  │◄──────│ Tariff settings      │
│ Track status            │orders │ picked_up → delivered│       │ Order timeline       │
│ Pay cash on delivery    │ table │ Cash received → done │       └──────────────────────┘
└─────────────────────────┘       └──────────────────────┘
            │                              │
            └────────── Supabase ──────────┘
              Postgres (orders/drivers/tariffs)
              Realtime (postgres_changes on orders)
              Auth (drivers + admin, email/password)
```

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript strict | Standard, deploys free on Vercel |
| Styling | Tailwind CSS v3 | Fast, no design system to build |
| Backend | Supabase: Postgres + Realtime + Auth (`@supabase/supabase-js`) | Free tier covers 5 drivers + local volume; realtime dispatch with no custom server |
| Maps | Leaflet + OpenStreetMap tiles | Free, no API key |
| Geocoding | Nominatim (OpenStreetMap) | Free; respect 1 req/s + identification |
| Routing | OSRM demo server, Haversine fallback | Free road distance; fallback keeps fares working offline from OSRM |
| PWA | Web manifest + hand-written service worker | Installable without Play Store; no dependency on unmaintained wrappers |
| Tests | Vitest | Unit tests for lib modules |
| Deploy | Vercel (free tier) | Static + server components, free |

## Data model (Supabase Postgres)

```sql
-- People who sign in: drivers + admin. Passengers are guests (Req 1);
-- passenger identity lives on the order itself.
create table profiles (
  id uuid primary key references auth.users(id),
  role text not null check (role in ('driver', 'admin')),
  display_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key references profiles(id),
  vehicle_plate text not null,      -- e.g. 'AE 1234 XY'
  vehicle_model text,               -- e.g. 'Honda Beat'
  is_online boolean not null default false,
  is_active boolean not null default true,  -- admin switch (Req 8)
  current_lat double precision,
  current_lng double precision,
  last_seen_at timestamptz
);

create table tariffs (
  id int primary key default 1 check (id = 1),  -- single current tariff row
  base_fare_idr int not null default 6000,      -- covers base_distance_km
  base_distance_km numeric not null default 2,
  per_km_idr int not null default 3500,
  updated_at timestamptz not null default now()
);
-- Seed: insert into tariffs default values (6000, 2, 3500).

create type order_service as enum ('ride', 'parcel', 'food');
create type order_status as enum
  ('created', 'accepted', 'picked_up', 'delivered', 'completed', 'cancelled');

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
  fare_idr int not null,                 -- delivery fee (for food: fee only)
  food_details text,                     -- warung + order text (food only)
  food_price_idr int,                    -- filled by driver after buying
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
```

Money is integer IDR everywhere. Distances are `numeric` km (one decimal
is enough for display; the fare uses the exact km value).

## Fare formula

Single source of truth at runtime: the `tariffs` row (admin-editable).
The client library mirrors it with the launch defaults:

```ts
fare = BASE_FARE_IDR + max(0, ceil(distanceKm - BASE_DISTANCE_KM)) * PER_KM_IDR
// defaults: 6000 + max(0, ceil(distanceKm - 2)) * 3500
```

Examples: 0–2 km → Rp 6.000; 2.1 km → Rp 9.500; 5 km → Rp 16.500;
10 km → Rp 34.000. For food, `fare_idr` is the delivery fee; the cash
total on delivery is `food_price_idr + fare_idr`. `src/lib/fare.ts`
implements this in pure integer arithmetic with unit tests; the order
flow re-checks the fare server-side (Supabase) before insert in Phase 2.

## Order lifecycle

```
created → accepted → picked_up → delivered → completed
   └────→ cancelled (from created / accepted, by passenger, driver, or admin)
```

- `created`: waiting for an online driver. Visible to all online drivers.
- `accepted`: one driver owns it (`driver_id` set, `accepted_at`).
- `picked_up`: ride = passenger on board; parcel = item collected;
  food = food bought at the warung (driver fills `food_price_idr` here).
- `delivered`: at the destination.
- `completed`: driver confirms cash received (`completed_at`).
- `cancelled`: terminal; records `cancelled_by` + `cancel_reason`.

## Realtime dispatch (first accept wins)

1. Passenger creates an order → `INSERT` into `orders` (status
   `created`).
2. Online drivers subscribe to Supabase Realtime `postgres_changes` on
   `orders` filtered to `status = 'created'`; the new order appears in
   their list instantly.
3. Driver taps Accept → `UPDATE orders SET driver_id = <me>,
   status = 'accepted', accepted_at = now() WHERE id = <order>
   AND status = 'created'`. The `AND status = 'created'` makes the
   accept atomic: only the first update changes a row (returns 1 row);
   a second driver gets 0 rows and sees "already taken".
4. The status change broadcasts to all subscribers; the order leaves
   other drivers' lists and appears on the passenger's status page
   (passenger polls/subscribes by order id).
5. Status buttons (picked_up / delivered / completed / cancel) are
   guarded the same way: each update requires the expected current
   status, so a stale phone cannot skip a step.

## Maps, geocoding, routing (free)

- **Display:** Leaflet + OpenStreetMap tiles (`tile.openstreetmap.org`).
  Attribution required on every map view.
- **Geocoding:** Nominatim (`nominatim.openstreetmap.org/search`). Usage
  policy: max 1 request/second, send a proper `User-Agent`/`Referer`
  identifying Wijaya Express. Debounce the address input; cache results
  per session so one order costs at most 2 geocode calls.
- **Routing:** OSRM demo server (`router.project-osrm.org/route/v1/driving`)
  for road distance + route geometry. The demo server is a shared test
  service with no SLA — the app must treat it as best-effort: on any
  failure/timeout, fall back to Haversine straight-line distance × 1.3
  (typical road factor in a small city) and label the fare "estimasi".
- **Service area:** Nganjuk + Jombang bounding box, checked client-side before
  the order is created (pickup and destination must both be inside).
  Exact box coordinates are set in Phase 2 after confirming them against
  OpenStreetMap.
- **Navigation:** no in-app turn-by-turn. The driver view links out to
  the phone's maps app (`https://www.google.com/maps/dir/?api=1&...` or
  `geo:` URI) for each leg. No Google Maps API key is used.

## Auth and row-level security (sketch; enforced in Phase 3–4)

- Drivers and admin sign in with Supabase Auth (email + password).
  Passengers are guests: no account, no login (Req 1).
- RLS sketch: `anon` may `INSERT` orders and `SELECT` one order by its
  id (for the status page); `authenticated` drivers may `SELECT` orders
  with status `created` plus their own assigned orders, and `UPDATE`
  only their assigned orders with the status guard above; `admin` role
  has full read on orders/drivers/tariffs and write on drivers/tariffs.
- The browser uses the anon key only. The service-role key is never in
  the app. Driver phone numbers are visible only to the assigned
  driver, the passenger of that order, and the admin (enforced by RLS +
  by only selecting the columns each view needs).

## Supabase configuration (graceful degradation)

The app reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` from the environment. Until the operator
creates the free Supabase project and sets these, the app still builds
and runs: `src/lib/supabase.ts` exports `isSupabaseConfigured()` and
`getSupabaseClient()` (returns `null` when unconfigured), and the home
page shows a clear "backend belum dikonfigurasi" state instead of
crashing. Order creation is disabled in that state.

## Testing strategy

- Unit tests (Vitest) for `src/lib/`: fare formula (boundaries 0/2/2.1/5/10
  km, invalid input, rupiah formatting), Supabase config detection
  (unconfigured → null client, no crash), distance helpers (Haversine vs
  known city pairs), order-status transition guards.
- Manual end-to-end on phones (2 phones minimum: 1 passenger + 1 driver):
  create order → driver sees it → accept → picked up → delivered →
  cash confirmed; plus negative paths (outside the service area, bad address,
  second driver accept race, offline driver gets nothing, backend
  unconfigured banner).
- `npm run type-check` and `npm run lint` must be green before every
  commit.

## Deployment

Vercel, free tier, from the public GitHub repo. Environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set in
the Vercel project settings after the operator creates the Supabase
project. No other secrets.

## Out of scope (v1)

In-app (non-cash) payments, merchant onboarding / menus for food (free
text only), in-app turn-by-turn navigation, surge/dynamic pricing,
ratings/reviews, push notifications, multi-city support, Play Store
listing. These are explicitly excluded to keep the launch achievable
with 5 drivers in one city.
