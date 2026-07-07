#!/usr/bin/env node
/**
 * Extract ALL TourRadar operator reviews for "Im Here Travels" into JSON + CSV.
 *
 * How it works (reverse-engineered from the operator CLP page):
 *  - GET https://www.tourradar.com/o/im-here-travels
 *      → page 1 of reviews is server-rendered (schema.org microdata),
 *      → the reviews container carries data-operator-id, and the page exposes
 *        window.csrf; the "Load more" button is data-page=2, data-per-page=10.
 *  - The load-more button POSTs to /api/operator/reviews with
 *      { operatorId, tourId:0, page, perPage(≤25), token: <csrf> }
 *    and an X-Requested-With: XMLHttpRequest header, returning
 *      { success, count, component: "<li>…</li>…" } (an HTML fragment).
 *    The endpoint is session-stateful — walk pages IN ORDER on one cookie jar.
 *
 * Run: node admin/client/scripts/tourradar-export/fetch-tourradar-reviews.mjs
 * Output: tourradar-reviews.json + tourradar-reviews.csv next to this script.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OPERATOR_URL = "https://www.tourradar.com/o/im-here-travels";
const API_URL = "https://www.tourradar.com/api/operator/reviews";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PER_PAGE = 10; // server caps perPage at 25
const HERE = dirname(fileURLToPath(import.meta.url));

// ── tiny cookie jar ──────────────────────────────────────────────────────────
const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = () =>
  Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ");

// ── html helpers ─────────────────────────────────────────────────────────────
const unescapeHtml = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const clean = (t) => unescapeHtml(t.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Parse an HTML fragment of <li itemprop="review"> blocks into review objects. */
function parseReviews(fragment) {
  const out = [];
  const blocks = fragment.split(/(?=<li[^>]*ao-clp-operator-reviews__review-item)/);
  for (const b of blocks) {
    if (!b.includes("reviewBody")) continue;
    const date = b.match(/datePublished"\s+content="([^"]+)"/)?.[1] ?? null;
    const reviewer =
      clean(b.match(/itemprop="author"[\s\S]*?itemprop="name">([\s\S]*?)<\/p>/)?.[1] ?? "") || null;
    const tourM = b.match(/<h3 itemprop="name"[^>]*>[\s\S]*?<a href="\/t\/(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    const tourId = tourM?.[1] ?? null;
    const tour = tourM ? clean(tourM[2]) : null;
    const starSeg =
      b.match(/ao-clp-operator-reviews__review-stars([\s\S]*?)<\/div>\s*(?:<span|itemprop="reviewRating"|<div class="ao-clp-operator-reviews__rating-label)/)?.[1] ?? b;
    const full = (starSeg.match(/review-star--full/g) || []).length;
    const half = (starSeg.match(/review-star--half/g) || []).length;
    const stars = full + 0.5 * half;
    const body = clean(b.match(/itemprop="reviewBody">([\s\S]*?)<\/(?:div|p)>/)?.[1] ?? "");
    out.push({ reviewer, tour, tourId, stars, date, body });
  }
  return out;
}

async function main() {
  // 1) Load the operator page: SSR page 1 + operatorId + csrf + cookies.
  const pageRes = await fetch(OPERATOR_URL, { headers: { "User-Agent": UA } });
  storeCookies(pageRes);
  const html = await pageRes.text();

  const operatorId = html.match(/data-operator-id="(\d+)"/)?.[1];
  const csrf = html.match(/window\.csrf\s*=\s*["']([^"']+)/)?.[1];
  const total = Number(html.match(/data-total="(\d+)"/)?.[1] || 0);
  if (!operatorId || !csrf) throw new Error("Could not read operatorId/csrf from page");
  console.log(`operatorId=${operatorId} total=${total}`);

  const listStart = html.indexOf("js-ao-clp-operator-reviews__list");
  const listEnd = html.indexOf("js-ao-clp-operator-reviews__load-more", listStart);
  const reviews = parseReviews(html.slice(listStart, listEnd));
  console.log(`page 1 (SSR): ${reviews.length}`);

  // 2) Walk the load-more API pages in order on the same session.
  for (let page = 2; ; page++) {
    const body = new URLSearchParams({
      operatorId, tourId: "0", page: String(page), perPage: String(PER_PAGE), token: csrf,
    });
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(),
        Referer: OPERATOR_URL,
      },
      body,
    });
    storeCookies(res);
    const data = await res.json();
    if (!data.success || !data.component) break;
    const batch = parseReviews(data.component);
    if (batch.length === 0) break;
    reviews.push(...batch);
    console.log(`page ${page}: ${batch.length}`);
    if (batch.length < PER_PAGE) break;
    if (total && reviews.length >= total) break;
  }

  const incomplete = reviews.filter((r) => !(r.reviewer && r.stars && r.date && r.body));
  console.log(`TOTAL: ${reviews.length}  incomplete: ${incomplete.length}`);

  writeFileSync(join(HERE, "tourradar-reviews.json"), JSON.stringify(reviews, null, 2), "utf-8");
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "reviewer,tour,tourId,stars,date,body",
    ...reviews.map((r) => [r.reviewer, r.tour, r.tourId, r.stars, r.date, r.body].map(esc).join(",")),
  ].join("\r\n");
  writeFileSync(join(HERE, "tourradar-reviews.csv"), "﻿" + csv, "utf-8");
  console.log("Wrote tourradar-reviews.json + tourradar-reviews.csv");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
