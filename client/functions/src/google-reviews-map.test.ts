/**
 * Plain-assert unit tests for the Google-review mapper + merge logic.
 * No test framework needed — run with: npm run test:google-reviews
 * (ts-node src/google-reviews-map.test.ts). Exits non-zero on failure.
 */
import assert from "node:assert";
import {
  GoogleReview,
  starRatingToNumber,
  splitDisplayName,
  reviewIdOf,
  mapGoogleReview,
  buildNewReviewFields,
  buildUpdateFields,
} from "./google-reviews-map";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`);
}

const SAMPLE: GoogleReview = {
  name: "accounts/123/locations/456/reviews/AbC_reviewId_789",
  starRating: "FIVE",
  comment: "  Best trip ever!  ",
  createTime: "2025-03-14T10:00:00Z",
  updateTime: "2025-03-14T10:00:00Z",
  reviewer: {
    displayName: "Jane Q Traveler",
    profilePhotoUrl: "https://lh3.googleusercontent.com/a/jane",
  },
  reviewReply: { comment: "Thanks Jane!" },
};

test("starRatingToNumber maps enums and unspecified", () => {
  assert.strictEqual(starRatingToNumber("FIVE"), 5);
  assert.strictEqual(starRatingToNumber("one"), 1);
  assert.strictEqual(starRatingToNumber("STAR_RATING_UNSPECIFIED"), 0);
  assert.strictEqual(starRatingToNumber(undefined), 0);
});

test("splitDisplayName takes first token, keeps remainder + full", () => {
  assert.deepStrictEqual(splitDisplayName("Jane Q Traveler"), {
    first: "Jane",
    last: "Q Traveler",
    full: "Jane Q Traveler",
  });
  assert.deepStrictEqual(splitDisplayName("Cher"), { first: "Cher", last: undefined, full: "Cher" });
  assert.strictEqual(splitDisplayName("   ").first, "Google user");
});

test("reviewIdOf prefers reviewId, else trailing path segment", () => {
  assert.strictEqual(reviewIdOf({ reviewId: "abc" }), "abc");
  assert.strictEqual(reviewIdOf(SAMPLE), "AbC_reviewId_789");
});

test("mapGoogleReview normalizes a full review", () => {
  const m = mapGoogleReview(SAMPLE)!;
  assert.strictEqual(m.externalId, "AbC_reviewId_789");
  assert.strictEqual(m.docId, "google_AbC_reviewId_789");
  assert.strictEqual(m.rating, 5);
  assert.strictEqual(m.bodyMarkdown, "Best trip ever!");
  assert.strictEqual(m.reviewerFirstName, "Jane");
  assert.strictEqual(m.reviewerFullName, "Jane Q Traveler");
  assert.strictEqual(m.reviewerAvatar, "https://lh3.googleusercontent.com/a/jane");
  assert.strictEqual(m.externalReply, "Thanks Jane!");
  assert.strictEqual(m.displayDate, "March 2025");
  assert.strictEqual(m.createdAt, Date.parse("2025-03-14T10:00:00Z"));
});

test("mapGoogleReview skips unspecified rating and missing id", () => {
  assert.strictEqual(mapGoogleReview({ ...SAMPLE, starRating: "STAR_RATING_UNSPECIFIED" }), null);
  assert.strictEqual(mapGoogleReview({ starRating: "FIVE" }), null);
});

test("buildNewReviewFields sets google provenance + empty tour + default status", () => {
  const m = mapGoogleReview(SAMPLE)!;
  const f = buildNewReviewFields(m, "published", 1_700_000_000_000);
  assert.strictEqual(f.source, "google");
  assert.strictEqual(f.externalSource, "google");
  assert.strictEqual(f.status, "published");
  assert.strictEqual(f.verified, false);
  assert.strictEqual(f.assigned, false);
  assert.strictEqual(f.tourId, "");
  assert.strictEqual(f.tourSlug, "");
  assert.strictEqual(f.externalId, "AbC_reviewId_789");
  assert.strictEqual(f.reviewerLastName, "Q Traveler");
});

test("buildUpdateFields returns null when updateTime did not advance", () => {
  const m = mapGoogleReview(SAMPLE)!;
  const res = buildUpdateFields(m, { externalUpdatedAt: m.externalUpdatedAt }, Date.now());
  assert.strictEqual(res, null);
});

test("buildUpdateFields refreshes ONLY content, preserving moderation", () => {
  const edited = mapGoogleReview({
    ...SAMPLE,
    comment: "Edited: still amazing",
    starRating: "FOUR",
    updateTime: "2025-06-01T10:00:00Z",
  })!;
  const res = buildUpdateFields(edited, { externalUpdatedAt: Date.parse("2025-03-14T10:00:00Z") }, 999)!;
  assert.ok(res, "expected an update");
  assert.strictEqual(res.rating, 4);
  assert.strictEqual(res.bodyMarkdown, "Edited: still amazing");
  // Must NOT carry status/assigned/tour fields — those stay admin-controlled.
  assert.strictEqual("status" in res, false);
  assert.strictEqual("assigned" in res, false);
  assert.strictEqual("tourSlug" in res, false);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} google-reviews-map tests passed.\n`);
