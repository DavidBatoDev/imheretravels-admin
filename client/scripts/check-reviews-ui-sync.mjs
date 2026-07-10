/**
 * Drift check for the ported public reviews UI.
 *
 * `admin/client/src/components/reviews/public/*` is a hand-maintained copy of the
 * public site's review components (the two apps are separate npm projects, so they
 * cannot import from each other — see that folder's README for the port rules).
 *
 * Copies rot silently. This script hashes each **www source** file and compares it
 * against a committed manifest. If www's reviews UI has changed since the last port,
 * it fails and names the files to re-port — so the admin "Site view" can't quietly
 * stop matching the live site.
 *
 * Usage:
 *   node scripts/check-reviews-ui-sync.mjs            # verify (exit 1 on drift)
 *   node scripts/check-reviews-ui-sync.mjs --update   # accept current www as the baseline
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const WWW = join(REPO_ROOT, "www");
const MANIFEST = join(__dirname, "reviews-ui.manifest.json");
const PORT_DIR = "admin/client/src/components/reviews/public";

/** www source → the ported copy it must stay in sync with. */
const PORTED_FILES = {
  "app/components/reviews/ReviewCard.tsx": "ReviewCard.tsx",
  "app/components/reviews/Stars.tsx": "Stars.tsx",
  "app/components/reviews/RatingBreakdown.tsx": "RatingBreakdown.tsx",
  "app/components/reviews/ReviewInsights.tsx": "ReviewInsights.tsx",
  "app/components/reviews/CategoryRatings.tsx": "CategoryRatings.tsx",
  "app/components/reviews/ExpandableBody.tsx": "ExpandableBody.tsx",
  "app/components/reviews/ReviewModal.tsx": "ReviewModal.tsx",
  "app/components/reviews/ReviewPhotos.tsx": "ReviewPhotos.tsx",
  "app/components/reviews/SearchInput.tsx": "SearchInput.tsx",
  "app/components/reviews/useListboxNav.ts": "useListboxNav.ts",
  "app/components/reviews/useFocusTrap.ts": "useFocusTrap.ts",
  "app/components/reviews/reviews-filter.ts": "reviews-filter.ts",
  "app/components/reviews/review-keywords.ts": "review-keywords.ts",
  "app/components/global/ImageWithSkeleton.tsx": "ImageWithSkeleton.tsx",
  "app/components/global/Markdown.tsx": "Markdown.tsx",
  "lib/country-flags.ts": "country-flags.ts",
  "lib/tourradar-links.ts": "tourradar-links.ts",
};

// Normalize line endings so a git autocrlf checkout doesn't read as drift.
const hash = (path) =>
  createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex");

const isUpdate = process.argv.includes("--update");

const current = {};
const missing = [];
for (const src of Object.keys(PORTED_FILES)) {
  const abs = join(WWW, src);
  if (!existsSync(abs)) missing.push(src);
  else current[src] = hash(abs);
}

if (missing.length) {
  console.error("❌ These www source files no longer exist — update PORTED_FILES:\n");
  missing.forEach((m) => console.error(`   www/${m}`));
  process.exitCode = 1;
} else if (isUpdate) {
  writeFileSync(MANIFEST, JSON.stringify(current, null, 2) + "\n");
  console.log(`✅ Manifest updated — ${Object.keys(current).length} files baselined.`);
} else if (!existsSync(MANIFEST)) {
  console.error(`❌ No manifest at ${MANIFEST}. Run with --update to create it.`);
  process.exitCode = 1;
} else {
  const baseline = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const drifted = Object.keys(current).filter((src) => baseline[src] !== current[src]);
  const untracked = Object.keys(current).filter((src) => !(src in baseline));

  if (drifted.length === 0) {
    console.log(`✅ Reviews UI in sync — ${Object.keys(current).length} files match the manifest.`);
  } else {
    console.error("❌ The public reviews UI changed since it was ported into admin.\n");
    console.error("   Re-port each file below, applying the rules in");
    console.error(`   ${PORT_DIR}/README.md, then run:`);
    console.error("       npm run check:reviews-ui -- --update\n");
    for (const src of drifted) {
      const kind = untracked.includes(src) ? "NEW" : "CHANGED";
      console.error(`   [${kind}] www/${src}`);
      console.error(`            → ${PORT_DIR}/${PORTED_FILES[src]}`);
    }
    process.exitCode = 1;
  }
}
