# Requirements — Wijaya Express

Wijaya Express is a local ride-hailing app for Madiun city only — a small,
Gojek-style service run by one operator (the admin) with 5 drivers at launch.
Three services: ride (antar orang), parcel (antar barang/paket), and food
(antar makanan). Payment is cash only (tunai). There is no wallet, no
in-app payment, and no Play Store app — the app is a PWA (installable web
app on phones) backed by Supabase (Postgres + Realtime + Auth).

Tariff (same formula for all three services; for food it is the delivery
fee only — the food price is paid separately in cash): base fare Rp 6.000
covers the first 2 km, then +Rp 3.500 per additional km, per started km
(rounded up). Formula: `fare = 6000 + max(0, ceil(distanceKm - 2)) * 3500`
(IDR). Example: 5 km → 6000 + 3 × 3500 = Rp 16.500.

Acceptance criteria use EARS notation: `WHEN <trigger> THE SYSTEM SHALL
<behavior>`.

## Requirement 1 — Place an order (passenger, guest)

**User story:** As a passenger in Madiun, I want to order a ride, a parcel
delivery, or food without creating an account, so I can get help fast.

- WHEN the passenger opens the app, THE SYSTEM SHALL show the three
  services (Antar Orang, Antar Barang, Antar Makanan) and the tariff
  (Rp 6.000 / 2 km pertama, +Rp 3.500 / km berikutnya).
- WHEN the passenger picks a service and enters pickup address, destination
  address, name, and phone number, THE SYSTEM SHALL geocode both addresses
  (Nominatim) and compute the road distance (OSRM, Haversine fallback).
- WHEN the distance is known, THE SYSTEM SHALL show the fare computed by
  the tariff formula before the passenger confirms the order.
- WHEN the passenger confirms, THE SYSTEM SHALL create an order with status
  `created` and show the order status page with the order ID.
- WHEN an address cannot be geocoded or the route cannot be computed, THE
  SYSTEM SHALL show a plain-language error and let the passenger correct
  the address (never silently use a wrong location).
- WHEN the pickup or destination is outside the Madiun service area, THE
  SYSTEM SHALL refuse the order and explain the service covers Madiun city
  only.

## Requirement 2 — Food order details

**User story:** As a passenger, I want to order food from a warung/resto by
writing what I want, so a driver can buy it and bring it to me.

- WHEN the passenger picks Antar Makanan, THE SYSTEM SHALL ask for the
  warung/resto name and the order as free text (menu items + quantity).
- WHEN the food order is created, THE SYSTEM SHALL treat the tariff fare as
  the delivery fee only; the food price is NOT included in the fare.
- WHEN the driver accepts a food order, THE SYSTEM SHALL show the driver
  the warung name, the order text, and the delivery fee; the food price
  is filled in by the driver after buying.
- WHEN the food is delivered, THE SYSTEM SHALL show the passenger the total
  cash to pay: food price + delivery fee.

## Requirement 3 — Fare calculation

**User story:** As the operator, I want one tariff formula applied
consistently, so passengers and drivers always agree on the price.

- WHEN the distance is 2 km or less, THE SYSTEM SHALL charge exactly
  Rp 6.000.
- WHEN the distance is over 2 km, THE SYSTEM SHALL charge Rp 6.000 plus
  Rp 3.500 for each started km beyond 2
  (e.g. 2.1 km → Rp 9.500; 5 km → Rp 16.500; 10 km → Rp 34.000).
- WHEN the distance is 0, negative, or not a number, THE SYSTEM SHALL
  reject the calculation and report an invalid distance (never charge a
  negative or zero fare).
- WHEN the fare is displayed, THE SYSTEM SHALL format it as Indonesian
  rupiah (e.g. `Rp 16.500`) and never use floating-point arithmetic for
  money (integer IDR throughout).

## Requirement 4 — Driver online/offline and dispatch

**User story:** As a driver, I want to go online, see new orders, and take
the ones I can do, so I only get work when I am ready.

- WHEN a driver signs in, THE SYSTEM SHALL show their online/offline
  toggle and their current status.
- WHEN a driver is online, THE SYSTEM SHALL show new `created` orders in
  real time (Supabase Realtime on the orders table) with service, pickup,
  destination, distance, and fare.
- WHEN a driver accepts an order, THE SYSTEM SHALL assign it to that
  driver only if the order is still `created` (first accept wins; the
  database update must be atomic so two drivers can never both win it).
- WHEN an order is accepted by another driver, THE SYSTEM SHALL remove it
  from the other online drivers' lists immediately.
- WHEN no driver accepts an order within 5 minutes, THE SYSTEM SHALL keep
  it visible to online drivers and show the passenger that drivers are
  still being notified (no silent expiry in v1).

## Requirement 5 — Order lifecycle and tracking

**User story:** As a passenger and a driver, I want to see the same order
status, so nobody has to call to ask where the order is.

- WHEN an order is created, THE SYSTEM SHALL set its status to `created`.
- WHEN a driver accepts, THE SYSTEM SHALL set status to `accepted` and
  record the driver and the accept time.
- WHEN the driver reaches the pickup point (ride: passenger boards;
  parcel: item collected; food: food bought at the warung), THE SYSTEM
  SHALL let the driver set status to `picked_up` and record the time.
- WHEN the driver reaches the destination, THE SYSTEM SHALL let the driver
  set status to `delivered` and record the time.
- WHEN the cash is received, THE SYSTEM SHALL let the driver confirm
  payment and set status to `completed` (for food: total = food price +
  delivery fee).
- WHEN the passenger or the driver cancels before pickup, THE SYSTEM SHALL
  set status to `cancelled`, record who cancelled and why, and free the
  driver.
- WHEN the passenger opens the order status page, THE SYSTEM SHALL show
  the current status, the assigned driver (name + phone) once accepted,
  and the fare — without requiring a login.

## Requirement 6 — Cash payment

**User story:** As a passenger and a driver, I want payment in cash on
delivery, so no one needs a bank account or e-wallet to use the service.

- WHEN the order is delivered, THE SYSTEM SHALL show the exact cash amount
  due (fare; for food: food price + delivery fee).
- WHEN the driver confirms cash received, THE SYSTEM SHALL mark the order
  `completed` and record the completed time.
- THE SYSTEM SHALL never ask for, store, or process card, bank, or
  e-wallet details.

## Requirement 7 — Driver app (mobile)

**User story:** As a driver on a motorbike, I want a simple phone screen
for my jobs, so I can use it with one hand at a stop.

- WHEN the driver opens the driver view, THE SYSTEM SHALL show at most:
  online toggle, the list of new orders, the active order, and a
  "navigate" link that opens the pickup/destination in the phone's maps
  app (external link, no in-app turn-by-turn navigation in v1).
- WHEN the driver has an active order, THE SYSTEM SHALL show only that
  order's actions (picked up / delivered / cash received / cancel) to
  avoid mistakes.
- WHEN the driver is offline, THE SYSTEM SHALL not show them new orders
  and not count them as available.

## Requirement 8 — Admin (operator)

**User story:** As the operator (admin), I want to manage drivers, tariffs,
and see every order, so I can run the service day to day.

- WHEN the admin signs in, THE SYSTEM SHALL show all orders (newest
  first) with service, status, passenger, driver, fare, and times.
- WHEN the admin opens driver management, THE SYSTEM SHALL list the 5
  launch drivers with online status, vehicle plate, and an active/inactive
  switch (inactive drivers never receive orders).
- WHEN the admin changes the tariff (base fare, included km, per-km rate),
  THE SYSTEM SHALL store it in the database and use the new tariff for
  all orders created after the change (existing orders keep their fare).
- WHEN the admin opens an order, THE SYSTEM SHALL show its full timeline
  (created → accepted → picked up → delivered → completed/cancelled).

## Requirement 9 — Maps (free, no Google Maps cost)

**User story:** As the operator, I want maps and routing with zero API
bills, so the service stays free to run.

- WHEN the app shows a map, THE SYSTEM SHALL use Leaflet with
  OpenStreetMap tiles.
- WHEN the app geocodes an address, THE SYSTEM SHALL use Nominatim and
  respect its usage policy (at most 1 request/second, proper identification).
- WHEN the app computes road distance, THE SYSTEM SHALL use the OSRM demo
  server and fall back to straight-line (Haversine) distance when OSRM is
  unreachable — and label the fare as an estimate in that case.
- THE SYSTEM SHALL never call a paid maps API (no Google Maps key).

## Requirement 10 — PWA (installable on phones)

**User story:** As a passenger and a driver, I want to install the app on
my phone from the browser, so it behaves like a real app without the Play
Store.

- WHEN the app is opened on a phone browser, THE SYSTEM SHALL offer
  install (web manifest + icons) and work as a standalone app after
  install.
- WHEN the app is opened without a network connection, THE SYSTEM SHALL
  show a clear offline message instead of a blank page.
- WHEN the Supabase backend is not configured, THE SYSTEM SHALL show a
  clear "backend not configured" state and never crash.

## Requirement 11 — Safety and privacy

**User story:** As a user, I want my phone number and location used only
for my order, so I can trust the service.

- WHEN an order is completed or cancelled, THE SYSTEM SHALL stop showing
  the passenger's live location to anyone except the admin.
- WHEN a driver views an order, THE SYSTEM SHALL show only that order's
  passenger name, phone, and addresses — no other passengers' data.
- THE SYSTEM SHALL never request, log, or store a password outside
  Supabase Auth, and never expose the Supabase service-role key in the
  app (anon key only in the browser).
