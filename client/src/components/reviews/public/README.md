# `components/reviews/public/` — ported copies of the public site's review UI

These files are **copies of `www/`'s review components**, so the admin "Site view"
renders exactly what a traveler sees on `imheretravels.com/reviews`.

They are copies rather than imports because `www/` and `admin/client/` are separate
npm projects (no monorepo, different Tailwind majors, different `@/*` aliases).

## Do not hand-edit to add admin behaviour

Keep these byte-faithful to their www originals apart from the documented local
patches below. Admin-specific behaviour belongs in the *wrappers* one level up
(`ReviewsSiteView.tsx`, `AdminReviewsFilterBar.tsx`), not in here.

## Drift check

`npm run check:reviews-ui` hashes the www originals and compares against
`reviews-ui.manifest.json`. When www's reviews UI changes, it fails and names the
files to re-port. After re-porting, refresh the manifest with:

```
npm run check:reviews-ui -- --update
```

## Local patches applied during the port

Everything below is a consequence of admin being **Tailwind v3** (JS config) while
www is **Tailwind v4** (CSS `@theme`), plus admin not being the public site.

| # | Rule | Why |
|---|------|-----|
| 1 | `bg-linear-to-t` → `bg-gradient-to-t` | `bg-linear-*` is v4-only syntax |
| 2 | `aspect-3/4` → `aspect-[3/4]` | bare-fraction `aspect` is v4-only |
| 3 | `rounded-sm\|md\|lg` → `rounded-brand-sm\|md\|lg` | in admin, plain `rounded-*` is the shadcn `--radius` scale (~4/6/8px); www's are brand radii (8/16/24px). `rounded-full` is unaffected. |
| 4 | `ReviewCard`: `next/link` → `<a target="_blank">` at `WEBSITE_URL` | admin has no `/tours/[slug]` route; the tour link must open the live site |
| 5 | `ImageWithSkeleton`: `fallbackSrc` defaults to *none* | www falls back to `/figma/tour-philippines-sunrise.png`, which does not exist in admin. On error we simply stop the shimmer. |
| 6 | imports: `@/app/components/**` → `./`, `@/lib/**` → `./`, `@/types/review` → `@/types/reviews` | different path aliases |

Supporting CSS (`.img-skeleton`, `.no-scrollbar` and their keyframes +
reduced-motion overrides) lives in `src/app/globals.css`.
Brand tokens (`crimson-red`, `midnight`, the `b*`/`h*` type scale, `shadow-small`)
are already defined in `tailwind.config.js`.
