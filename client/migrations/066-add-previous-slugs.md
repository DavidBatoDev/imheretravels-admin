# 066 — Add previousSlugs (old-slug redirects)

## What changed

Added an optional `previousSlugs` array to every `tourPackages` document. Each entry records an old slug that should permanently redirect to the tour's current `slug` on www, plus a per-slug `redirect` flag so an admin can keep the record but disable the redirect.

## Schema

```ts
interface PreviousSlug {
  slug: string;       // an old URL slug, kebab-case
  redirect: boolean;  // true → redirect to current slug; false → record only (old URL 404s)
}

// Added to TourPackage:
previousSlugs?: PreviousSlug[];
```

## Migration script

None required. The field is optional; documents without it behave as an empty list. The `PATCH /api/tours/[id]` handler reconciles `previousSlugs` on every save:
- It honours the array the form sends (manual add/remove + per-slug redirect toggles).
- When `slug` changes on a save, the **prior** slug is auto-appended with `redirect: true` (unless that slug is already present, so an admin-disabled entry is never re-enabled).
- The new current slug is never kept as one of its own previous slugs.

## www behaviour

- `/tours/{oldSlug}` → if no active tour matches the slug, resolve it against active tours' enabled `previousSlugs` and `permanentRedirect` (301) to `/tours/{currentSlug}`; otherwise 404.
- Bare `/{oldSlug}` (short URL) → handled by the dynamic root catch-all `app/[slug]/page.tsx`, which redirects to `/tours/{currentSlug}`.
- Entries with `redirect: false` are ignored by the resolver, so the old URL 404s.
- Reflects within the ISR window (`revalidate = 3600`); admin saves also call `revalidateWww()`.

## Admin editor

`TourSettingsPanel` → **SEO & URLs** → "Previous Slugs (redirect to this tour)":
- Add an old slug (normalized to kebab-case, Enter/comma to commit).
- Each entry shows `/tours/{slug}`, a redirect on/off `Switch`, and a remove button; disabled rows are dimmed and labelled "off · 404s".
- Renaming the tour's URL slug auto-adds the prior slug here on save.
