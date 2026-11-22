---
inclusion: always
---

# Product — Wijaya Express

## What it is

Wijaya Express is a local ride-hailing app for Kabupaten Nganjuk dan Jombang only. One
operator (admin) runs it with 5 drivers at launch. Three services: ride
(antar orang), parcel (antar barang/paket), food (antar makanan). Payment
is cash only. Passengers order as guests (no account). Drivers and the
admin sign in with Supabase Auth. The app is a PWA — installable on phones
from the browser, no Play Store listing.

## Who it is for

- **Passengers di Nganjuk dan Jombang**: anyone who needs a motorbike ride, a parcel
  delivered, or food brought from a warung — ordered in under a minute,
  paid in cash.
- **Drivers**: 5 local drivers at launch, working when they toggle online.
- **Admin (the operator)**: runs the service day to day — drivers,
  tariffs, all orders.

## Tariff (one formula, all services)

Base fare Rp 6.000 covers the first 2 km, then +Rp 3.500 per started km
beyond 2. For food the fare is the delivery fee only; the food price is
paid separately in cash (total = food price + delivery fee). The driver
fronts the food money at the warung.

## Product principles

1. **Local only, on purpose.** Kabupaten Nganjuk dan Jombang. One tariff, one operator,
   five drivers. No multi-city complexity in v1.
2. **Cash is the payment system.** No bank account, e-wallet, or card is
   needed by anyone. The app never touches money.
3. **First accept wins.** Orders broadcast to all online drivers; the
   first atomic accept owns the order. No dispatcher in the middle.
4. **Free to run.** Supabase free tier, Vercel free tier, OpenStreetMap
   tiles, Nominatim, OSRM — zero paid APIs. If a free service degrades,
   the app falls back (Haversine) instead of breaking.
5. **Guest passengers.** No account wall between a passenger and an
   order. Drivers and admin sign in; passengers just give a name and a
   phone number.

## Non-goals (v1)

- No in-app (non-cash) payments.
- No merchant onboarding or food menus (food orders are free text).
- No in-app turn-by-turn navigation (external maps link instead).
- No surge/dynamic pricing, ratings, push notifications, or multi-city.
- No Play Store app (PWA only).

## Success criteria

- A passenger can place an order and see the fare in under 60 seconds.
- An online driver sees a new order in real time and accepts it in one tap.
- The full lifecycle (created → accepted → picked_up → delivered →
  completed, cash) works end to end on real phones.
- The app builds, runs, and shows a clear "backend not configured" state
  before Supabase is connected — never a crash.
