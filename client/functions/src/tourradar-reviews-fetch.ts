// functions/src/tourradar-reviews-fetch.ts
/**
 * Scrapes a tour's reviews from TourRadar.
 *
 * Ported from `admin/client/scripts/tourradar-export/fetch-tourradar-reviews.mjs` so the
 * scheduled sync and the one-off script share one parser.
 *
 * TourRadar exposes no public reviews API. Each `/t/{id}` page server-renders the first
 * page of reviews with a `data-review-json` attribute per item; the rest come from the
 * `POST /api/tour/load` "load more" endpoint, which needs the page's CSRF token and
 * cookies. Because this is a scrape, it can fail or truncate at any time — so
 * `fetchTourReviews` reports the site's own `total` alongside what it actually got, and
 * the caller MUST treat `complete === false` as "do not prune this tour".
 */

const BASE = "https://www.tourradar.com";
const LOAD_API = `${BASE}/api/tour/load`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_PAGES = 60;

/**
 * Headers a real browser sends on a top-level navigation. A bare `User-Agent` is a common
 * bot tell; TourRadar serves the review markup only to requests that look like navigations.
 * (If it is blocking by datacenter IP rather than fingerprint, these will not help — the
 * `diagnostics` on each FetchResult say which.)
 */
const NAV_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "no-cache",
};

export interface TourRadarVideo {
  src: string;
  poster: string;
}

export interface TourRadarReview {
  reviewId: string;
  tourRadarTourId: string;
  reviewer: string;
  avatar: string | null;
  countryEmoji: string;
  rating: number;
  dateISO: string | null;
  displayDate: string;
  body: string;
  operatorReply: string;
  photos: string[];
  videos: TourRadarVideo[];
}

/**
 * What the tour page actually returned. Without this, "collected 0 of 0" is ambiguous —
 * it reads the same whether the page was a bot challenge, a redirect, or genuinely empty.
 * A scrape that works from a laptop and returns nothing from a datacenter IP is the normal
 * failure here, and it is only diagnosable if we record what came back.
 */
export interface FetchDiagnostics {
  httpStatus: number;
  bytes: number;
  /** The reviews container markup we key the `total` counter off. */
  sawReviewContainer: boolean;
  /** At least one `data-review-json` block, i.e. real server-rendered reviews. */
  sawReviewJson: boolean;
  /** `<title>` of whatever we got — names a challenge/consent page immediately. */
  pageTitle: string;
  finalUrl: string;
}

export interface FetchResult {
  tourRadarTourId: string;
  reviews: TourRadarReview[];
  /** TourRadar's own advertised review count for this tour (0 when unparseable). */
  total: number;
  /**
   * True only when the scrape finished cleanly AND we collected at least `total`
   * reviews. The prune is gated on this — a partial scrape must never delete rows.
   */
  complete: boolean;
  error?: string;
  diagnostics?: FetchDiagnostics;
}

// ── tiny cookie jar ──────────────────────────────────────────────────────────
function makeJar() {
  const jar = new Map<string, string>();
  return {
    store(res: Response) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    header: () => Array.from(jar, ([k, v]) => `${k}=${v}`).join("; "),
  };
}

// ── html helpers ─────────────────────────────────────────────────────────────
const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const httpsify = (u: string): string => (u && u.startsWith("//") ? "https:" + u : u);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** ISO "2026-03-22T11:07:41+01:00" → "March 22, 2026" (UTC-safe, no locale dep). */
function toDisplayDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Media carousel anchors inside a single review's HTML block. */
function parseMedia(block: string): { photos: string[]; videos: TourRadarVideo[] } {
  const photos: string[] = [];
  const videos: TourRadarVideo[] = [];
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

/** Parse `<li … js-ao-tour-reviews__review-item>` blocks into review objects. */
function parseReviews(fragment: string, tourRadarTourId: string): TourRadarReview[] {
  const out: TourRadarReview[] = [];
  const blocks = fragment.split(
    /(?=<li class="ao-tour-reviews__review-item js-ao-tour-reviews__review-item")/,
  );
  for (const b of blocks) {
    const attr = b.match(/data-review-json='([\s\S]*?)'\s*>/);
    if (!attr) continue;
    let j: Record<string, any>;
    try {
      j = JSON.parse(decodeEntities(attr[1]));
    } catch {
      continue;
    }
    if (j.isAnonymous) continue; // anonymised entries have no author to attribute
    const iso = b.match(/itemprop="datePublished"\s+content="([^"]+)"/)?.[1] ?? null;
    const { photos, videos } = parseMedia(b);
    out.push({
      reviewId: String(j.id),
      tourRadarTourId,
      reviewer: (j.authorName || "").trim(),
      avatar: httpsify((j.authorImage || "").trim()) || null,
      countryEmoji: (j.countryEmoji || "").trim(),
      rating: Number(j.rating) || 5,
      dateISO: iso,
      displayDate: toDisplayDate(iso),
      body: (j.comments || "").trim(),
      operatorReply: (j.operatorComment || "").trim(),
      photos,
      videos,
    });
  }
  return out;
}

/**
 * Fetch every review for one TourRadar tour.
 *
 * Never throws: a network or parse failure comes back as `{ complete: false, error }`
 * with whatever was collected, because the caller's prune decision depends on knowing
 * the difference between "this tour has no reviews" and "we failed to read this tour".
 */
export async function fetchTourReviews(tourRadarTourId: string): Promise<FetchResult> {
  const byId = new Map<string, TourRadarReview>();
  let total = 0;
  let diagnostics: FetchDiagnostics | undefined;

  try {
    const jar = makeJar();
    const pageRes = await fetch(`${BASE}/t/${tourRadarTourId}`, { headers: NAV_HEADERS });
    if (!pageRes.ok) {
      return {
        tourRadarTourId,
        reviews: [],
        total: 0,
        complete: false,
        error: `tour page responded ${pageRes.status}`,
        diagnostics: {
          httpStatus: pageRes.status,
          bytes: 0,
          sawReviewContainer: false,
          sawReviewJson: false,
          pageTitle: "",
          finalUrl: pageRes.url,
        },
      };
    }
    jar.store(pageRes);
    const html = await pageRes.text();

    diagnostics = {
      httpStatus: pageRes.status,
      bytes: html.length,
      sawReviewContainer: html.includes("js-ao-tour-reviews__review-container"),
      sawReviewJson: html.includes("data-review-json"),
      pageTitle: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 120),
      finalUrl: pageRes.url,
    };

    const csrf = html.match(/window\.csrf\s*=\s*["']([^"']+)/)?.[1];
    total = Number(
      html.match(/js-ao-tour-reviews__review-container[^>]*data-total="(\d+)"/)?.[1] ||
        html.match(/data-total="(\d+)"[^>]*data-onpage/)?.[1] ||
        0,
    );

    for (const r of parseReviews(html, tourRadarTourId)) byId.set(r.reviewId, r);

    // Walk the "load more" pages until we have `total` (dedup by review id).
    for (let page = 2; total && byId.size < total && page < MAX_PAGES; page++) {
      const res = await fetch(LOAD_API, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: jar.header(),
          Referer: `${BASE}/t/${tourRadarTourId}`,
        },
        body: new URLSearchParams({
          action: "reviews_more",
          id: tourRadarTourId,
          page: String(page),
          sort: "",
          should_be_fully_reloaded: "0",
          ...(csrf ? { token: csrf } : {}),
        }),
      });
      jar.store(res);
      const data = (await res.json().catch(() => null)) as {
        status?: string;
        component?: string;
      } | null;
      if (!data || data.status !== "OK" || !data.component) break;
      const before = byId.size;
      for (const r of parseReviews(data.component, tourRadarTourId)) byId.set(r.reviewId, r);
      if (byId.size === before) break; // no new reviews → stop
    }
  } catch (error) {
    return {
      tourRadarTourId,
      reviews: [...byId.values()],
      total,
      complete: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics,
    };
  }

  const reviews = [...byId.values()];
  // `total` of 0 means we couldn't read the counter — treat that as incomplete rather
  // than as "this tour legitimately has zero reviews", which would authorise a prune.
  const complete = total > 0 && reviews.length >= total;
  return {
    tourRadarTourId,
    reviews,
    total,
    complete,
    ...(complete ? {} : { error: describeFailure(reviews.length, total, diagnostics) }),
    diagnostics,
  };
}

/**
 * Say *why* a scrape came up short. "collected 0 of 0" is true but useless: it looks
 * identical whether TourRadar served a bot challenge or the tour really has no reviews.
 */
function describeFailure(
  got: number,
  total: number,
  d: FetchDiagnostics | undefined,
): string {
  if (d && !d.sawReviewContainer && !d.sawReviewJson) {
    // A 200 with none of the review markup means we were served something else entirely.
    return (
      `page loaded (${d.httpStatus}, ${d.bytes} bytes) but contained no review markup — ` +
      `likely a bot challenge or consent page${d.pageTitle ? ` titled "${d.pageTitle}"` : ""}`
    );
  }
  if (d && d.sawReviewContainer && total === 0) {
    return `review container present but its data-total counter was unreadable (markup change?)`;
  }
  return `collected ${got} of ${total} review(s)`;
}
