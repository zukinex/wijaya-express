---
inclusion: always
---

# Tech — Wijaya Express

## Stack

- Next.js 15 (App Router), React 19, TypeScript strict (ES2020 target),
  Tailwind CSS v3, Vitest.
- Supabase (`@supabase/supabase-js`): Postgres + Realtime + Auth. Free
  tier. Project does not exist yet — the operator creates it and supplies
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Leaflet + OpenStreetMap tiles for maps (Phase 2). Nominatim for
  geocoding (max 1 req/s, proper identification). OSRM demo server for
  road routing with Haversine fallback.
- PWA: web manifest + hand-written service worker (Phase 5).
- Deploy: Vercel free tier.

## Rules

- `npm run type-check` and `npm run lint` must be green before every
  commit. `npm run build` must exit 0.
- Money: integer IDR only. Fares via `src/lib/fare.ts` — never recompute
  the formula inline in a component.
- Supabase access goes through `src/lib/supabase.ts` only, so the
  unconfigured state is handled in exactly one place.
- No Google Maps API, no paid API of any kind. If a free service is down,
  fall back and label the result an estimate — never crash, never silently
  use a wrong location.
- RLS: anon may insert orders and read one order by id; drivers read
  `created` orders + their own; admin has full read. Enforce in Phase 3–4
  alongside the atomic accept guard (`WHERE status = 'created'`).
