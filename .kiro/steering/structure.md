---
inclusion: always
---

# Project Structure — Wijaya Express

## Layout

```
wijaya-express/
├── .kiro/
│   ├── specs/wijaya-express/   # requirements.md, design.md, tasks.md
│   └── steering/               # product.md, structure.md, tech.md
├── public/                     # static assets (PWA manifest + icons in Phase 5)
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # root layout, metadata (id), globals.css
│   │   ├── page.tsx            # home shell: services, tariff, backend status
│   │   ├── globals.css         # Tailwind + base styles
│   │   ├── order/[id]/         # Phase 2: order status page
│   │   ├── driver/             # Phase 3: driver view
│   │   └── admin/              # Phase 4: admin view
│   ├── components/             # shared UI (added per phase)
│   └── lib/
│       ├── fare.ts             # tariff formula + rupiah formatting (Phase 1)
│       ├── supabase.ts         # Supabase client, graceful unconfigured state (Phase 1)
│       ├── geo.ts              # Phase 2: Haversine, Nganjuk + Jombang bounding box
│       └── routing.ts          # Phase 2: OSRM + Nominatim + fallbacks
├── .env.example                # Supabase env var names (no real values)
├── next.config.mjs
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

## Conventions

- TypeScript strict, ES2020 target. Money is integer IDR everywhere —
  never floats for fares or prices.
- `src/lib/` modules are pure and unit-tested with Vitest; UI components
  stay thin and call into `lib`.
- Indonesian UI copy (the users are di Nganjuk dan Jombang). Code, comments, and specs
  in English; user-facing text in Indonesian.
- Env vars: only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the browser. Never the service-role
  key. The app must run (degraded, with a clear banner) when they are
  absent.
- `.kiro/` stays tracked in git — the spec is part of the repo.
