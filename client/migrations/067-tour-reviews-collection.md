# 067 — Tour reviews moved to a dedicated `tourReviews` collection

> **Status: consolidation complete.** The legacy `details.reviews[]` code path has
> been removed entirely — the tour-form editor, the `TourReview` types in both apps,
> and the www read/map path. `tourReviews` is now the single source of truth.
>
> No data migration was run: a dev audit found the array survived on exactly 1 of 21
> tours, holding a single `"THIS IS A TEST!"` row. The one-off
> `migrate-embedded-reviews-to-collection.ts` and `check-embedded-reviews.mjs` scripts
> were deleted with it. The orphaned `details.reviews` **field is intentionally left in
> Firestore** as a zero-cost rollback net; nothing reads it. If you later want it gone,
> `FieldValue.delete()` it per tour — and note that prod was never audited (no prod key).

## What changed

Reviews used to live as an embedded `details.reviews[]` array on each
`tourPackages` document. They now live in a top-level **`tourReviews`**
collection so we can support:

- verified **user-submitted** reviews (from confirmed/completed travelers)
- **moderation** (hide/publish) and a cross-tour admin dashboard
- **photos** (trip photos) and reviewer profile pictures
- `Review` + `AggregateRating` **SEO** markup and a `/reviews` community hub

## Collection schema — `tourReviews/{id}`

```ts
{
  tourId: string; tourSlug: string; tourName: string; // association + denormalized
  rating: number;                 // 1–5
  title?: string;
  bodyMarkdown: string;           // markdown source
  reviewerFirstName: string; reviewerLastName?: string;
  reviewerLocation?: string; reviewerAvatar?: string;
  photos?: string[];
  status: "published" | "hidden" | "pending";
  source: "user" | "admin";
  verified: boolean;              // matched a confirmed booking for this tour
  bookingId?: string; bookingCode?: string;  // PRIVATE — never exposed publicly
  createdAt: Timestamp; updatedAt: Timestamp;
  displayDate?: string;           // legacy free-text date from migrated rows
}
```

## Migration script (one-off)

`scripts/migrate-embedded-reviews-to-collection.ts` seeds `tourReviews` from
every tour's embedded `details.reviews[]`:

```bash
npx ts-node client/scripts/migrate-embedded-reviews-to-collection.ts --dry-run
npx ts-node client/scripts/migrate-embedded-reviews-to-collection.ts --production
```

Idempotent — each migrated row gets a deterministic id (`{tourId}__embedded__{i}`),
so re-runs skip existing docs. Migrated rows are `source:"admin"`,
`status:"published"`, `verified:false`. The embedded array is left in place for
rollback; the website no longer reads it.

## After migrating

Ping www ISR revalidation so tour pages + `/reviews` pick up the collection:
`POST https://www.imheretravels.com/api/revalidate` with `x-revalidate-secret`.

## Admin

New **Tour Reviews** dashboard (`/reviews`) lists all reviews across tours
(quote, first name, tour name, rating, photos, status, verified, date), with
filters and hide/publish, add/remove photos, delete, and create-admin-review.
The old embedded editor in `TourForm` now shows a banner pointing here; its edits
are legacy and no longer render on the site.

## www

- Env (optional): `FIREBASE_STORAGE_BUCKET` — defaults to
  `imheretravels-a3f81.firebasestorage.app`. Used by the review image upload route.
- New routes: `POST /api/reviews/verify`, `POST /api/reviews/upload`,
  `POST /api/reviews` (submit). Reads via `lib/reviews-firestore.ts`.
