import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTourReviews } from "../../functions/src/tourradar-reviews-fetch";

/**
 * These tests guard ONE property: `complete` is true only when we are certain we saw the
 * whole feed. The scheduled import gates its (soft) prune on that flag, so a false
 * positive here would let a truncated scrape hide real reviews.
 *
 * Everything else about the scrape is best-effort; this is not.
 */

/** Build a review-item block the way TourRadar server-renders it. */
function reviewBlock(id: number, author = "Jamie"): string {
  const json = JSON.stringify({
    id,
    authorName: author,
    rating: 5,
    comments: `Great trip ${id}`,
  }).replace(/'/g, "&#39;");
  return (
    `<li class="ao-tour-reviews__review-item js-ao-tour-reviews__review-item" ` +
    `data-review-json='${json}' >` +
    `<meta itemprop="datePublished" content="2026-03-22T11:07:41+01:00">` +
    `</li>`
  );
}

function tourPage(total: number, items: string[]): string {
  return (
    `<div class="js-ao-tour-reviews__review-container" data-total="${total}">` +
    items.join("") +
    `</div>`
  );
}

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: any) => handler(String(input))));
}

const html = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" } });

afterEach(() => vi.unstubAllGlobals());

describe("fetchTourReviews — prune safety", () => {
  it("is complete when every advertised review is collected", async () => {
    mockFetch(() => html(tourPage(2, [reviewBlock(1), reviewBlock(2)])));

    const res = await fetchTourReviews("321149");

    expect(res.reviews).toHaveLength(2);
    expect(res.total).toBe(2);
    expect(res.complete).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("is INCOMPLETE when the scrape returns fewer reviews than advertised", async () => {
    // 10 advertised, 1 rendered, and the load-more endpoint yields nothing.
    mockFetch((url) =>
      url.includes("/api/tour/load")
        ? new Response(JSON.stringify({ status: "ERROR" }), { status: 200 })
        : html(tourPage(10, [reviewBlock(1)])),
    );

    const res = await fetchTourReviews("321149");

    expect(res.reviews).toHaveLength(1);
    expect(res.total).toBe(10);
    expect(res.complete).toBe(false);
    expect(res.error).toMatch(/collected 1 of 10/);
  });

  it("is INCOMPLETE when the total counter cannot be read, even with reviews present", async () => {
    // A markup change that breaks the counter must not read as "this tour has 0 reviews",
    // which would authorise pruning everything.
    mockFetch(() => html(`<div>${reviewBlock(1)}</div>`));

    const res = await fetchTourReviews("321149");

    expect(res.reviews).toHaveLength(1);
    expect(res.total).toBe(0);
    expect(res.complete).toBe(false);
  });

  it("is INCOMPLETE, and never throws, when the tour page errors", async () => {
    mockFetch(() => new Response("nope", { status: 429 }));

    const res = await fetchTourReviews("321149");

    expect(res.complete).toBe(false);
    expect(res.reviews).toEqual([]);
    expect(res.error).toMatch(/429/);
  });

  it("is INCOMPLETE, and never throws, when the network fails outright", async () => {
    mockFetch(() => {
      throw new Error("ECONNRESET");
    });

    const res = await fetchTourReviews("321149");

    expect(res.complete).toBe(false);
    expect(res.error).toMatch(/ECONNRESET/);
  });

  it("an empty feed for a tour that advertises reviews is never complete", async () => {
    mockFetch((url) =>
      url.includes("/api/tour/load")
        ? new Response(JSON.stringify({ status: "ERROR" }), { status: 200 })
        : html(tourPage(59, [])),
    );

    const res = await fetchTourReviews("321149");

    // This is the exact shape of the data-loss bug: a scrape that silently returns
    // nothing must not license the caller to delete 59 rows.
    expect(res.reviews).toEqual([]);
    expect(res.complete).toBe(false);
  });

  it("names a bot-challenge page instead of reporting '0 of 0'", async () => {
    // A 200 carrying none of the review markup. This is what Cloud Functions saw on
    // 2026-07-10: every tour "succeeded" and returned nothing.
    mockFetch(() =>
      html("<html><head><title>Just a moment...</title></head><body>checking</body></html>"),
    );

    const res = await fetchTourReviews("321149");

    expect(res.complete).toBe(false);
    expect(res.diagnostics).toMatchObject({
      httpStatus: 200,
      sawReviewContainer: false,
      sawReviewJson: false,
      pageTitle: "Just a moment...",
    });
    expect(res.error).toMatch(/no review markup/);
    expect(res.error).toMatch(/Just a moment/);
    // The old message was indistinguishable from an empty tour.
    expect(res.error).not.toBe("collected 0 of 0 review(s)");
  });

  it("distinguishes a markup change from a block", async () => {
    // Container present (so we reached the real page) but the counter is gone.
    mockFetch((url) =>
      url.includes("/api/tour/load")
        ? new Response(JSON.stringify({ status: "ERROR" }), { status: 200 })
        : html(`<div class="js-ao-tour-reviews__review-container">${reviewBlock(1)}</div>`),
    );

    const res = await fetchTourReviews("321149");

    expect(res.complete).toBe(false);
    expect(res.diagnostics?.sawReviewContainer).toBe(true);
    expect(res.error).toMatch(/counter was unreadable/);
  });

  it("sends browser navigation headers, not a bare User-Agent", async () => {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: any, init: any) => {
        seen.push(init?.headers ?? {});
        return html(tourPage(1, [reviewBlock(1)]));
      }),
    );

    await fetchTourReviews("321149");

    expect(seen[0]).toMatchObject({
      "Sec-Fetch-Mode": "navigate",
      Accept: expect.stringContaining("text/html"),
      "Accept-Language": expect.stringContaining("en"),
    });
  });

  it("dedups reviews repeated across pages", async () => {
    let page = 0;
    mockFetch((url) => {
      if (!url.includes("/api/tour/load")) return html(tourPage(3, [reviewBlock(1)]));
      page += 1;
      // Page 2 re-sends review 1 alongside 2 and 3.
      const body = page === 1 ? [reviewBlock(1), reviewBlock(2), reviewBlock(3)] : [];
      return new Response(
        JSON.stringify({ status: "OK", component: body.join("") }),
        { status: 200 },
      );
    });

    const res = await fetchTourReviews("321149");

    expect(res.reviews.map((r) => r.reviewId).sort()).toEqual(["1", "2", "3"]);
    expect(res.complete).toBe(true);
  });

  it("skips anonymised reviews but still counts them against the advertised total", async () => {
    const anon =
      `<li class="ao-tour-reviews__review-item js-ao-tour-reviews__review-item" ` +
      `data-review-json='${JSON.stringify({ id: 9, isAnonymous: true })}' ></li>`;
    mockFetch((url) =>
      url.includes("/api/tour/load")
        ? new Response(JSON.stringify({ status: "ERROR" }), { status: 200 })
        : html(tourPage(2, [reviewBlock(1), anon])),
    );

    const res = await fetchTourReviews("321149");

    expect(res.reviews).toHaveLength(1);
    // We dropped one on purpose, so we can't claim we saw the whole feed — and therefore
    // must not prune. Conservative by design.
    expect(res.complete).toBe(false);
  });
});
