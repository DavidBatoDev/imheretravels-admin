#!/usr/bin/env node
/**
 * Extract ALL TourRadar reviews for "Im Here Travels" — with FULL text, photos,
 * videos and full dates — by reading each tour's own review page (not the
 * operator page, which only exposes truncated previews and no media).
 *
 * How it works (reverse-engineered from the tour detail page /t/{id}):
 *  - GET https://www.tourradar.com/t/{tourId}
 *      → every review is server-rendered with a data-review-json='{…}' attribute
 *        carrying the COMPLETE data: id, authorName, authorImage, date, dateTravel,
 *        rating, comments (untruncated), operatorComment (owner reply).
 *      → below each review a `js-review-photos-carousel` lists media as
 *        <a class="js-am-tour-reviews__review-open-photos" data-content-type=…
 *           data-image-src=… data-video-src=… data-poster=…>.
 *      → the reviews container carries data-total; window.csrf is exposed.
 *  - Tours with >~10 reviews render only the first page; the rest load via
 *      POST https://www.tourradar.com/api/tour/load
 *        { action:"reviews_more", id:<tourId>, page:<n>, sort:"", should_be_fully_reloaded:"0" }
 *      + X-Requested-With: XMLHttpRequest → { status:"OK", total, component:"<li …>" }
 *      (5 per page). We walk pages and DEDUP by review id until we have `total`.
 *
 * Run: node admin/client/scripts/tourradar-export/fetch-tourradar-reviews.mjs
 * Output: tourradar-reviews.json + tourradar-reviews.csv next to this script.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// TourRadar tour name → id. The tour name below is what we store; the site-tour
// mapping (name → slug) lives in import-tourradar-reviews.mjs.
const TOURS = [
  { id: "321149", name: "India Discovery" },
  { id: "298994", name: "Philippines Sunset" },
  { id: "298995", name: "Philippines Sunrise" },
  { id: "324172", name: "Vietnam Expedition" },
  { id: "323687", name: "Sri Lanka Wander" },
];

const BASE = "https://www.tourradar.com";
const LOAD_API = `${BASE}/api/tour/load`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const HERE = dirname(fileURLToPath(import.meta.url));

// ── tiny cookie jar ──────────────────────────────────────────────────────────
function makeJar() {
  const jar = new Map();
  return {
    store(res) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    header: () => Array.from(jar, ([k, v]) => `${k}=${v}`).join("; "),
    size: () => jar.size,
  };
}

// ── html helpers ─────────────────────────────────────────────────────────────
const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const httpsify = (u) => (u ? (u.startsWith("//") ? "https:" + u : u) : u);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// ISO "2026-03-22T11:07:41+01:00" → "March 22, 2026" (UTC-safe, no locale dep).
function toDisplayDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Extract the media carousel anchors that live inside a single review's HTML. */
function parseMedia(block) {
  const photos = [];
  const videos = [];
  for (const m of block.matchAll(
    /<a class="js-am-tour-reviews__review-open-photos"[^>]*>/g,
  )) {
    const a = m[0];
    const type = a.match(/data-content-type="([^"]*)"/)?.[1];
    const imageSrc = httpsify(a.match(/data-image-src="([^"]*)"/)?.[1] ?? "");
    const videoSrc = httpsify(a.match(/data-video-src="([^"]*)"/)?.[1] ?? "");
    const poster = httpsify(a.match(/data-poster="([^"]*)"/)?.[1] ?? "");
    if (type === "video" && videoSrc) {
      videos.push({ src: videoSrc, poster: poster || imageSrc || "" });
    } else if (imageSrc) {
      photos.push(imageSrc);
    }
  }
  return { photos, videos };
}

/**
 * Parse an HTML fragment of <li … js-ao-tour-reviews__review-item> blocks into
 * full review objects (reads the data-review-json attribute + media carousel).
 */
function parseReviews(fragment, tour) {
  const out = [];
  const blocks = fragment.split(
    /(?=<li class="ao-tour-reviews__review-item js-ao-tour-reviews__review-item")/,
  );
  for (const b of blocks) {
    const attr = b.match(/data-review-json='([\s\S]*?)'\s*>/);
    if (!attr) continue;
    let j;
    try {
      j = JSON.parse(decodeEntities(attr[1]));
    } catch {
      continue;
    }
    if (j.isAnonymous) continue; // skip anonymised entries with no author
    const iso = b.match(/itemprop="datePublished"\s+content="([^"]+)"/)?.[1] ?? null;
    const { photos, videos } = parseMedia(b);
    out.push({
      reviewId: String(j.id),
      tourId: tour.id,
      tour: tour.name,
      reviewer: (j.authorName || "").trim(),
      avatar: httpsify((j.authorImage || "").trim()) || null,
      rating: Number(j.rating) || 5,
      dateISO: iso,
      dateDisplayRaw: j.date || "", // e.g. "March 22nd, 2026" (with ordinal)
      displayDate: toDisplayDate(iso),
      dateTravel: j.dateTravel || "",
      body: (j.comments || "").trim(),
      operatorReply: (j.operatorComment || "").trim(),
      photos,
      videos,
    });
  }
  return out;
}

async function fetchTour(tour) {
  const jar = makeJar();
  const pageRes = await fetch(`${BASE}/t/${tour.id}`, {
    headers: { "User-Agent": UA },
  });
  jar.store(pageRes);
  const html = await pageRes.text();
  const csrf = html.match(/window\.csrf\s*=\s*["']([^"']+)/)?.[1];
  const total = Number(
    html.match(/js-ao-tour-reviews__review-container[^>]*data-total="(\d+)"/)?.[1] ||
      html.match(/data-total="(\d+)"[^>]*data-onpage/)?.[1] ||
      0,
  );

  const byId = new Map();
  for (const r of parseReviews(html, tour)) byId.set(r.reviewId, r);
  console.log(`  ${tour.name} (t/${tour.id}): total=${total}, ssr=${byId.size}`);

  // Walk the load-more pages until we have `total` (dedup by review id).
  for (let page = 2; total && byId.size < total && page < 60; page++) {
    const res = await fetch(LOAD_API, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: jar.header(),
        Referer: `${BASE}/t/${tour.id}`,
      },
      body: new URLSearchParams({
        action: "reviews_more",
        id: tour.id,
        page: String(page),
        sort: "",
        should_be_fully_reloaded: "0",
        ...(csrf ? { token: csrf } : {}),
      }),
    });
    jar.store(res);
    const data = await res.json().catch(() => null);
    if (!data || data.status !== "OK" || !data.component) break;
    const before = byId.size;
    for (const r of parseReviews(data.component, tour)) byId.set(r.reviewId, r);
    console.log(`    page ${page}: +${byId.size - before} (have ${byId.size}/${total})`);
    if (byId.size === before) break; // no new reviews → stop
  }

  return [...byId.values()];
}

async function main() {
  const all = [];
  console.log("Fetching TourRadar reviews per tour…");
  for (const tour of TOURS) {
    const reviews = await fetchTour(tour);
    all.push(...reviews);
  }

  const truncated = all.filter((r) => /[…]$/.test(r.body.trim()));
  const withPhotos = all.filter((r) => r.photos.length).length;
  const withVideos = all.filter((r) => r.videos.length).length;
  const missingDate = all.filter((r) => !r.displayDate).length;
  console.log(
    `\nTOTAL: ${all.length}  photos:${withPhotos}  videos:${withVideos}` +
      `  ellipsis-bodies:${truncated.length}  missing-date:${missingDate}`,
  );
  if (truncated.length) {
    console.warn("⚠️  Some bodies still end in an ellipsis:");
    truncated.slice(0, 5).forEach((r) => console.warn(`   ${r.tour} · ${r.reviewer}`));
  }

  writeFileSync(join(HERE, "tourradar-reviews.json"), JSON.stringify(all, null, 2), "utf-8");
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "reviewId,tour,tourId,reviewer,rating,dateISO,displayDate,photos,videos,body",
    ...all.map((r) =>
      [
        r.reviewId, r.tour, r.tourId, r.reviewer, r.rating, r.dateISO, r.displayDate,
        r.photos.length, r.videos.length, r.body,
      ]
        .map(esc)
        .join(","),
    ),
  ].join("\r\n");
  writeFileSync(join(HERE, "tourradar-reviews.csv"), "﻿" + csv, "utf-8");
  console.log("Wrote tourradar-reviews.json + tourradar-reviews.csv");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
