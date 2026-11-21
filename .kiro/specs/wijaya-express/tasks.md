# Tasks — Wijaya Express

Build order for the Wijaya Express spec. Work top to bottom; mark a task
done only after its tests pass and `npm run type-check` is green.
Requirements are referenced as `Req N` (see `requirements.md`).

## Phase 1 — Spec + scaffold

- [x] 1. Write this spec: `requirements.md` (EARS), `design.md`
      (architecture, data model, fare formula, realtime dispatch, maps),
      `tasks.md` (this file). Confirm the tariff (Rp 6.000 / 2 km, +Rp 3.500
      / km) and the 3 services with the operator before building.
      _Req 1–11_
- [x] 2. Scaffold Next.js 15 (App Router) + TypeScript strict + Tailwind
      CSS in this repo; verify `npm run dev` serves the starter page.
      _Req 10_
- [x] 3. Create `src/lib/fare.ts`: `calculateFare(distanceKm)`,
      `calculateFareFromMeters(distanceMeters)`, `formatRupiah(amount)`,
      constants `BASE_FARE_IDR = 6000`, `BASE_DISTANCE_KM = 2`,
      `PER_KM_IDR = 3500`; unit tests for boundaries (0, 2, 2.1, 5, 10
      km) and invalid input (negative, NaN, Infinity).
      _Req 3_
- [x] 4. Create `src/lib/supabase.ts`: `isSupabaseConfigured()`,
      `getSupabaseClient()` (returns `null` when env is missing),
      `getSupabaseConfigStatus()`; the app must build and run without
      env vars and show a "backend not configured" state, never crash.
      Unit tests for the unconfigured state.
      _Req 10_
- [x] 5. Build the home shell (`src/app/page.tsx`, Indonesian): header
      "Wijaya Express — Ojek Lokal Madiun", the 3 service cards, the
      tariff card with a worked example (5 km → Rp 16.500), the backend
      status banner, and a footer (Madiun only, cash, 5 drivers).
      _Req 1, Req 3, Req 10_

## Phase 2 — Fare + ordering UI (passenger)

- [x] 6. Create `src/lib/geo.ts`: Haversine distance, Madiun bounding-box
      check, `formatDistance`; unit tests against known Madiun points.
      _Req 1, Req 9_
- [x] 7. Create `src/lib/routing.ts`: OSRM route fetch (road distance +
      geometry) with Haversine × 1.3 fallback and an `isEstimate` flag;
      Nominatim geocode helper (debounced, 1 req/s); unit tests with
      mocked fetch (OSRM ok, OSRM down → fallback, geocode fail).
      _Req 1, Req 9_
- [x] 8. Build the order form (guest, no login): service picker (ride /
      parcel / food), pickup + destination address inputs with map point
      picking (Leaflet), food free-text fields (warung + order), live
      fare preview from the tariff formula; validate name + phone before
      submit.
      _Req 1, Req 2, Req 3, Req 9_
- [x] 9. Wire order creation to Supabase: insert into `orders` with the
      computed fare; on success route to the order status page
      (`/order/[id]`); on backend-unconfigured, block with the banner
      message.
      _Req 1, Req 10_
- [x] 10. Build the order status page: live status, assigned driver
       (name + phone) once accepted, fare, and (food) total cash due;
       subscribe to the order row via Supabase Realtime.
       _Req 5, Req 6_

## Phase 3 — Driver app + realtime dispatch

- [x] 11. Set up Supabase Auth (email/password) for drivers + admin;
      create the 5 driver accounts and the admin account; write the RLS
      policies from `design.md` (anon insert orders, drivers read
      `created` + own orders, admin full read).
      _Req 4, Req 8, Req 11_
      **DONE 2026-11-21 (subagent):** RLS policies in
      `supabase-rls.sql` (validated: every table/column referenced was
      confirmed to exist via live REST queries); test accounts in
      `test-accounts.md` (TEST ONLY, gitignored); seed template in
      `supabase-seed-drivers.sql` (UUID placeholders). OPERATOR STILL
      HAS TO: run `supabase-rls.sql` in SQL Editor, create the 6 auth
      users in the dashboard (Authentication → Users → Add user, Auto
      Confirm ON), run the seed SQL with the real UUIDs, and turn OFF
      public sign-ups (Authentication → Providers). No accounts were
      created by the agent; service-role key was never used/asked for.
- [x] 12. Build the driver view (`/driver`): sign-in, online/offline
       toggle, live list of `created` orders (Realtime), accept with the
       atomic first-accept guard (`WHERE status = 'created'`), active
       order actions (picked up / delivered / cash received / cancel),
       and "navigate" external maps links.
       _Req 4, Req 5, Req 7_
       **DONE 2026-11-21 (subagent):** `src/lib/driver.ts` + tests,
       `src/app/driver/page.tsx` (Indonesian), home page links to
       `/driver`. Verified: 87/87 tests pass, type-check 0 errors,
       lint clean, build exit 0, smoke test 200 on `/`, `/pesan`,
       `/driver`, `/order/[id]`.
- [x] 13. Add the food-price step: on `picked_up` for a food order the
       driver enters the food price paid at the warung; the status page
       then shows total cash = food price + delivery fee.
       _Req 2, Req 6_
       **DONE 2026-11-21 (subagent):** food-price input on the driver
       active-order card (required, positive integer) + live total-cash
       preview; `advanceOrder` validates it; passenger status page
       already showed food price + total (Phase 2).
- [ ] 14. Test the accept race with 2 driver phones on the same order:
       only one wins; the other sees "already taken" and the order leaves
       their list.
       _Req 4_
       **MANUAL, operator-side (not done by agent):** needs 2 phones
       signed in as 2 different test drivers, both online, tapping
       "Terima" on the same order at the same time. Steps: (1) both
       drivers online on /driver; (2) passenger creates any order from
       /pesan; (3) both drivers see it under "Order baru"; (4) both tap
       "Terima" together; (5) expected: one sees the order move to
       "Order aktif", the other sees "Order ini sudah diambil driver
       lain" and the order disappears from their list; (6) passenger
       status page shows exactly one driver.

## Phase 4 — Admin

- [ ] 15. Build the admin view (`/admin`): all orders newest first with
       filters by status/service, full order timeline, driver list with
       online status + active/inactive switch, tariff editor (base fare,
       included km, per-km rate) writing to the `tariffs` row.
       _Req 8_
- [ ] 16. Verify the tariff change rule: orders created after a change
       use the new tariff; existing orders keep their stored fare.
       _Req 3, Req 8_

## Phase 5 — PWA + testing + launch

- [ ] 17. Add the PWA manifest + icons + hand-written service worker
       (app shell cached, clear offline message); verify "Add to Home
       screen" on Android Chrome and iOS Safari.
       _Req 10_
- [ ] 18. Full manual end-to-end on real phones (1 passenger + 1 driver
       minimum, 5 drivers for the race test): ride, parcel, and food
       orders through created → accepted → picked up → delivered →
       completed (cash); plus negative paths (outside Madiun, bad
       address, OSRM down → estimate fare, backend unconfigured, second
       accept race, offline driver receives nothing).
       _Req 1–11_
- [ ] 19. Deploy to Vercel from the public repo (env vars set in Vercel
       settings after the operator creates the Supabase project);
       verify the full flow on the public URL from a phone.
       _Req 10_
- [ ] 20. Launch checklist with the operator: 5 driver accounts + plates
       registered, tariff confirmed (6000/2/3500), Madiun bounding box
       confirmed, cash float for food fronting agreed with drivers,
       admin phone as the support contact on the home page.
       _Req 4, Req 8_
