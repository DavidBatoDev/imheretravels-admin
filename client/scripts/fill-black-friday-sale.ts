/**
 * Creates (or fills) the "black-friday" sale with its launch content: tours and
 * tier ladders from the pricing CSV, hero copy, banners, SEO and the start
 * time. Status is always left as Draft — going Live is a decision made in the
 * admin editor. When creating, each CSV tour is matched to a non-hosted, active
 * or draft tour package; if several match, the one with upcoming dates wins.
 *
 *   Dry run (prints the plan, writes nothing):
 *     NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/fill-black-friday-sale.ts <csv> --project dev
 *   Write:
 *     ... --project dev --write
 *     ... --project prod --write      (uses your gcloud application-default login)
 *
 * CSV: Tour,Slots,...,Discount GBP — each row is a tier; Slots = how many
 * people get that discount (1 slot = 1 person). Other columns are ignored.
 */
import { readFileSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";

const PROJECTS = { dev: "imheretravels-dev", prod: "imheretravels-a3f81" } as const;
const SLUG = "black-friday";
const START_AT = "2026-11-01T00:00:00+00:00"; // midnight UK (GMT on 1 Nov)

// CSV label → the tours it stands for; each tour is a list of alternative
// spellings matched against the tour name (or an exact card sub-header).
const GROUPS: Record<string, string[][]> = {
  kazhakstan: [["kazakhstan", "kazhakstan"]],
  "ph tours": [["philippine sunrise"], ["philippine sunset"]],
};
const groupsFor = (label: string) => GROUPS[label] ?? [[label]];
const MATCH: Record<string, string[]> = new Proxy({}, { get: (_t, label: string) => groupsFor(label).flat() });

const HERO = {
  title: "Black Friday Sale",
  subtitle:
    "Our biggest savings of the year on small-group tours. Each tour has a limited number of sale slots, one per person, and the earliest slots save the most. Hold yours for 15 minutes and pay just the reservation fee.",
};
const SEO = {
  title: "Black Friday Sale: Up to £500 Off Small-Group Tours | I'm Here Travels",
  description:
    "Save up to £500 per person on small-group tours to Argentina, Japan, Greece, Iceland and more. Limited sale slots per tour, cheapest first. Pay just the reservation fee today.",
};
// Banner art: tour covers already used on the site (desktop wide shot, mobile portrait-friendly).
const BANNER_FROM = { desktop: "argentina", mobile: "greece" };

function parseArgs() {
  const args = process.argv.slice(2);
  const csv = args.find((a) => !a.startsWith("--"));
  const project = args[args.indexOf("--project") + 1] as keyof typeof PROJECTS;
  if (!csv || !PROJECTS[project]) throw new Error("Usage: fill-black-friday-sale.ts <csv> --project dev|prod [--write]");
  return { csv, project, write: args.includes("--write") };
}

function tiersFromCsv(path: string): Map<string, number[]> {
  const [header, ...rows] = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  const iTour = cols.indexOf("tour");
  const iSlots = cols.findIndex((c) => c === "slots" || c === "slot count" || c === "qty");
  const iDisc = cols.findIndex((c) => c.startsWith("discount"));
  if (iTour < 0 || iSlots < 0 || iDisc < 0) throw new Error(`CSV needs Tour, Slots, Discount GBP columns (got: ${header})`);
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const c = r.split(",").map((x) => x.trim());
    const count = Number(c[iSlots]);
    const discount = Number(c[iDisc].replace(/[£,]|\s*OFF$/gi, ""));
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(discount)) throw new Error(`Bad row: ${r}`);
    const key = c[iTour].toLowerCase();
    out.set(key, [...(out.get(key) ?? []), ...Array(count).fill(discount)]);
  }
  return out;
}

async function main() {
  const { csv, project, write } = parseArgs();
  const projectId = PROJECTS[project];

  if (project === "prod") {
    // lib/firebase-admin-db reuses an existing app named "server-db"; give it the
    // gcloud application-default credentials instead of a service-account key.
    if (!getApps().some((a) => a.name === "server-db")) {
      initializeApp({ credential: applicationDefault(), projectId }, "server-db");
    }
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  } else if (process.env.FIREBASE_PROJECT_ID !== projectId) {
    throw new Error(`.env points at ${process.env.FIREBASE_PROJECT_ID}, expected ${projectId}`);
  }

  const { adminDb } = await import("@/lib/firebase-admin-db");
  const { getSale, getSaleIdBySlug, saveSale } = await import("@/lib/sale/sales");
  const db = adminDb();

  const ladders = tiersFromCsv(csv);
  const saleId = await getSaleIdBySlug(SLUG);
  const sale = saleId ? (await getSale(saleId))! : null;
  console.log(
    sale
      ? `Sale ${saleId} in ${projectId}: "${sale.name}", status ${sale.status}, ${sale.tours.length} tours`
      : `No "${SLUG}" sale in ${projectId}: a new Draft sale will be created`,
  );

  // Tours: the existing sale's, or picked from the CSV for a new sale.
  let tourIds: string[];
  if (sale) {
    tourIds = sale.tours.map((t) => t.tourPackageId);
  } else {
    const all = (await db.collection("tourPackages").get()).docs.filter(
      (d) => d.get("isHosted") !== true && ["active", "draft"].includes(d.get("status")),
    );
    const hasFutureDate = (d: (typeof all)[number]) =>
      ((d.get("travelDates") ?? []) as { startDate?: { toMillis?: () => number }; isAvailable?: boolean }[]).some(
        (t) => t.isAvailable !== false && (t.startDate?.toMillis?.() ?? 0) > Date.now(),
      );
    tourIds = [];
    for (const label of ladders.keys()) {
      for (const alternatives of groupsFor(label)) {
        const word = alternatives.join(" / ");
        const hits = all.filter((d) =>
          alternatives.some(
            (w) =>
              String(d.get("name") ?? "").toLowerCase().includes(w) ||
              String(d.get("cardSubHeader") ?? "").toLowerCase() === w,
          ),
        );
        const dated = hits.filter(hasFutureDate);
        const pick = hits.length === 1 ? hits : dated.length === 1 ? dated : null;
        if (!pick) {
          throw new Error(
            `CSV "${label}" (${word}): ${hits.length ? `several tours match: ${hits.map((h) => h.get("name")).join(", ")}` : "no tour matches"}`,
          );
        }
        if (!tourIds.includes(pick[0].id)) tourIds.push(pick[0].id);
      }
    }
  }

  const tourDocs = await db.getAll(...tourIds.map((id) => db.collection("tourPackages").doc(id)));
  const used = new Set<string>();
  const tours = tourIds.map((tourPackageId, i) => {
    const doc = tourDocs[i];
    const name = String(doc.get("name") ?? "").toLowerCase();
    const sub = String(doc.get("cardSubHeader") ?? "").toLowerCase();
    const label = [...ladders.keys()].find((l) =>
      (MATCH[l] ?? [l]).some((w) => name.includes(w) || sub.includes(w)),
    );
    if (!label) throw new Error(`No CSV row for sale tour "${doc.get("name")}"`);
    used.add(label);
    const ladder = ladders.get(label)!;
    const price = Number(doc.get("pricing.original")) || 0;
    const locked = (sale?.inventory[tourPackageId]?.slots ?? []).filter((s) => s.status !== "available");
    if (locked.length) throw new Error(`"${doc.get("name")}" has held/sold slots; edit it in the admin instead`);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${String(doc.get("name")).padEnd(42)} ${doc.get("status")}  £${price}  ${ladder.length} slots: ${ladder.join(",")}  → from £${price - ladder[0]}`,
    );
    return { tourPackageId, order: i, ladder, cover: String(doc.get("media.coverImage") ?? ""), name };
  });
  const unused = [...ladders.keys()].filter((l) => !used.has(l));
  if (unused.length) console.log(`  CSV tours not in the sale (skipped): ${unused.join(", ")}`);

  const coverFor = (key: string) => tours.find((t) => (MATCH[key] ?? [key]).some((w) => t.name.includes(w)))?.cover || tours[0]?.cover || "";
  const bannerUrl = coverFor(BANNER_FROM.desktop);
  const mobileBannerUrl = coverFor(BANNER_FROM.mobile);

  const input = {
    slug: SLUG,
    name: sale?.name || "Black Friday Sale 2026",
    status: "draft" as const,
    startAt: START_AT,
    endAt: null,
    holdMinutes: 15,
    checkoutMode: "auto" as const,
    hero: { ...HERO, bannerUrl, mobileBannerUrl },
    seo: { ...SEO, ogImage: bannerUrl },
    tours: tours.map(({ tourPackageId, order, ladder }) => ({ tourPackageId, order, ladder })),
  };
  console.log(`\nHero: "${HERO.title}" | start ${START_AT} | status draft | ends TBA`);
  console.log(`SEO title (${SEO.title.length}/70): ${SEO.title}`);
  console.log(`SEO description (${SEO.description.length}/200): ${SEO.description}`);
  console.log(`Desktop banner: ${bannerUrl.slice(0, 90)}…\nMobile banner: ${mobileBannerUrl.slice(0, 90)}…`);
  if (SEO.title.length > 70 || SEO.description.length > 200) throw new Error("SEO text too long");

  if (!write) {
    console.log("\nDry run: nothing written. Add --write to apply.");
    return;
  }
  const savedId = await saveSale(saleId, input, "setup-script");
  const after = (await getSale(savedId))!;
  console.log(`\nSaved sale ${savedId}. Status ${after.status}; slots per tour: ${after.tours.map((t) => after.inventory[t.tourPackageId]?.slots.length).join(",")}`);
  console.log(`Admin: https://admin.imheretravels.com/tours/sales/${savedId}/edit`);
  console.log(`Preview: https://imheretravels.com/sale-preview/${after.previewToken}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
