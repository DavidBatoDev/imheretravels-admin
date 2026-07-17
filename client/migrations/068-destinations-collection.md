# 068 — Destinations CMS collection

Migrates the destination landing pages from the static registry
`www/data/destinations.ts` to a Firestore `destinations` collection authored in
the admin CMS (mirrors the resident-hosts migration).

## What changed

- **Admin (write side):** `types/destinations.ts`, `services/destinations-service.ts`,
  API routes `api/destinations/route.ts` + `[id]/route.ts`, UI under
  `app/destinations/**` and `components/destinations/**`, plus a "Destinations"
  entry in `DashboardSidebar.tsx`.
- **www (read side):** `lib/destinations-firestore.ts` exposes async
  `getAllDestinations` / `getDestinationBySlug` / `getAllDestinationSlugs` /
  `getTourDestination`, reading the `destinations` collection. Consumers repointed:
  `app/all-destinations/[slug]/page.tsx`, `app/all-destinations/page.tsx`,
  `app/tours/page.tsx`, `app/sitemap.ts`. The `Destination` type still lives in
  `www/data/destinations.ts`.

## Field mapping

- www `meta: { title, description }` → Firestore `seo: { title, description }`
  (the www `toDestination()` normalizer maps it back to `meta`).
- Added `status: "active"`, `order` (registry position, preserves index order),
  and `metadata { createdAt, updatedAt, createdBy }`.
- Empty `highlights` / `community.images` are normalized back to `undefined` on
  read so the page keeps deriving highlights from linked tours and hides an empty
  community grid.

## Running the seed

From `admin/client`, with `.env.local` pointing at the target project:

```bash
tsx scripts/seed-destinations.ts          # dev only (guarded on imheretravels-dev)
tsx scripts/seed-destinations.ts --force  # allow a non-dev project (e.g. prod)
```

Idempotent — doc id === slug, upsert with merge. Seeds all 14 destinations.

## Post-seed

- Verify 14 docs in `destinations`, all `status: "active"`.
- The old `www/data/destinations.ts` array is retained as the type source and
  seed input; it is no longer read at request time.
