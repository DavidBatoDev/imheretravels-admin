# Google reviews sync — setup & first migration

This wires up `syncGoogleReviews` (in `src/scheduled-sync-google-reviews.ts`) to import
your Google Business Profile reviews into the `tourReviews` collection. Reviews come in
**unassigned** and **auto-published** (so they show on `/reviews`); an admin then assigns
each to a tour (or "Community hub only"). Google reviews never count toward a tour's star
average or `AggregateRating` JSON-LD (Google policy) — they render as cards with a
"via Google" badge.

All commands run from `admin/client/functions`.

---

## What you need to provide

1. **A Google Cloud project with the Google My Business API (v4) enabled + access approved.**
2. **OAuth client** (client id/secret) + a **refresh token** with the `business.manage` scope.
3. Your **account id** and **location id** (discovered below).

> ⚠️ The **reviews** endpoint is the legacy **Google My Business API (v4)**, which is
> **not** in the Cloud API Library — it's gated behind a one-time **Business Profile APIs
> access request** (https://developers.google.com/my-business/content/basic-setup →
> "Request access"). Until it's approved, `reviews.list` returns **403** (the sync treats
> this as harmless and just skips). Having the GMB dashboard does **not** grant API access.
>
> The Account Management + Business Information APIs (used to **discover your
> account/location ids**) are in the Library and enable immediately, BUT new projects get a
> **default Business Profile API quota of 0** — so calls return **429 "Quota exceeded ...
> Requests per minute"** until Google grants quota. That quota grant comes with the same
> Business Profile APIs access request, so in practice you need it approved before even
> `discover:gbp` succeeds. Request it and include your **project number** (here `283391684985`).

---

## 1. Google Cloud project + APIs

1. In the Google Cloud Console, pick/create a project.
2. **APIs & Services → Library** → enable these two now (used for id discovery):
   - **My Business Account Management API**
   - **My Business Business Information API**
3. Submit the **Business Profile APIs access request** form (as the owner, amer@) and wait
   for approval — this is what unlocks the legacy **Google My Business API (v4)** that serves
   **reviews**. It won't appear in the Library until you're allowlisted. (The other My
   Business APIs — Lodging, Notifications, Place Actions, Q&A, Verifications, Performance —
   are not needed.)

## 2. OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID → Desktop app.**
2. Copy the **Client ID** and **Client secret**.

## 3. Refresh token (business.manage)

Use the OAuth Playground (or your own desktop flow):

1. https://developers.google.com/oauthplayground → gear icon → **Use your own OAuth
   credentials** → paste client id/secret.
2. In "Input your own scopes" enter `https://www.googleapis.com/auth/business.manage` →
   **Authorize APIs** → sign in with the account that owns the business.
3. **Exchange authorization code for tokens** → copy the **refresh token**.
4. (Optional) verify the scope with `node check-refresh-token-scopes.mjs` after pointing it
   at your GBP client id/secret.

## 4. `.env`

```bash
cp .env.example .env
```

Fill `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`, and `REVALIDATE_SECRET`
(must equal the www app's `REVALIDATE_SECRET`). Leave the two IDs for the next step.

## 5. Discover account + location ids

```bash
npm run discover:gbp
```

Prints your accounts/locations and a ready-to-paste snippet. Put `GBP_ACCOUNT_ID` and
`GBP_LOCATION_ID` into `.env`. (A 403 here means step 1's access request isn't approved yet.)

## 6. Point at the right project + seed a DRY-RUN config

```bash
firebase use <your-dev-project>     # or prod when ready
npm run gbp:config                  # writes config/google-reviews-sync with dryRun:true
```

## 7. Dry run

```bash
npm run shell        # builds, then opens the Functions shell
```

At the prompt:

```
syncGoogleReviews()
```

A dry run **reads + maps only, writes nothing**. Check the logs: a fetched count and **no
403**. If you see 403, access isn't approved yet — stop here.

## 8. Go live (real import)

```bash
npm run gbp:config -- --live        # flips dryRun:false
npm run shell
> syncGoogleReviews()
```

Verify:
- `google_{reviewId}` docs now exist in `tourReviews`.
- A run entry appears in `google-reviews-logs` (`{ fetched, created, updated, skipped }`).
- The www `/reviews` hub shows the reviews with the **via Google** badge (revalidation fires
  when something is newly published).

## 9. Triage in the admin

Open the admin **Reviews** dashboard. Each Google review shows as **Unassigned** — use the
row menu → **Assign to tour** (or **Community hub only**). Assigned reviews then appear on
that tour's page.

## 10. Deploy the scheduled sync

```bash
npm run deploy
```

This registers the 6-hourly cron (`0 */6 * * *`, `asia-southeast1`). Make sure the same env
vars exist for the deployed function (the committed-ignored `functions/.env` is auto-loaded
at deploy, or set them as Firebase environment variables). Re-syncs are **idempotent** and
**preserve your moderation** — `buildUpdateFields` never overwrites `status`, `assigned`, or
the tour assignment, and only refreshes content when Google's `updateTime` advances.

---

## Safety / rollback
- `config/google-reviews-sync.enabled = false` stops the sync entirely.
- `dryRun = true` makes runs read-only.
- Everything is keyed by deterministic `google_{reviewId}` ids with merge writes, so re-runs
  never duplicate.
- Secrets live only in `functions/.env` (git-ignored) — never commit real values.
