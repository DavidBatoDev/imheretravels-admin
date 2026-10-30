/**
 * Seeds the Black Friday sale from the pricing CSV into the DEV project.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/seed-black-friday-sale.ts <csv> [--write]
 *
 * CSV header: Tour,Slots,Original Price,Discount GBP,Sale Price  (e.g. "Argentina,1,2199,500 OFF,1699").
 * Without --write it only prints how each CSV tour matches a tourPackage.
 * With --write it creates/updates the sale with slug "black-friday" as a draft.
 * Production sales are set up in the admin UI (Sales & Discounts), not here.
 */
import { readFileSync } from "node:fs";
import { adminDb } from "@/lib/firebase-admin-db";
import { getSale, getSaleIdBySlug, saveSale, type SaleInputT } from "@/lib/sale/sales";

const SLUG = "black-friday";
// CSV spellings that differ from the tour's country label.
const ALIASES: Record<string, string> = { kazhakstan: "kazakhstan" };

async function main() {
  if (process.env.FIREBASE_PROJECT_ID !== "imheretravels-dev") {
    throw new Error(`Refusing to run against ${process.env.FIREBASE_PROJECT_ID}; dev only.`);
  }
  const [csvPath, flag] = process.argv.slice(2);
  if (!csvPath) throw new Error("Usage: seed-black-friday-sale.ts <csv> [--write]");

  const rows = readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const [tour, slot, original, discount] = l.split(",").map((c) => c.trim());
      return { tour, slot: Number(slot), original: Number(original), discount: Number(discount.replace(/\s*OFF$/i, "")) };
    });
  const byTour = new Map<string, typeof rows>();
  for (const r of rows) byTour.set(r.tour, [...(byTour.get(r.tour) ?? []), r]);

  const tours = (await adminDb().collection("tourPackages").where("status", "==", "active").get()).docs;
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

  const input: SaleInputT["tours"] = [];
  const unmatched: string[] = [];
  let order = 0;
  for (const [name, ladderRows] of byTour) {
    const key = ALIASES[norm(name)] ?? norm(name);
    const candidates = tours.filter((t) => norm(t.get("cardSubHeader")) === key);
    const fallback = candidates.length ? candidates : tours.filter((t) => norm(t.get("name")).includes(key));
    const nonHosted = fallback.filter((t) => t.get("isHosted") !== true);
    const pick = (nonHosted.length ? nonHosted : fallback)[0];
    if (!pick || fallback.length === 0) {
      unmatched.push(name);
      console.log(`UNMATCHED  ${name}`);
      continue;
    }
    const extra = fallback.length > 1 ? `  (also: ${fallback.filter((t) => t !== pick).map((t) => t.get("name")).join(", ")})` : "";
    const price = pick.get("pricing")?.original;
    console.log(
      `${name.padEnd(11)} -> ${pick.get("name")} [${pick.id}] tour £${price}, CSV £${ladderRows[0].original}${price !== ladderRows[0].original ? "  ⚠ price differs" : ""}${extra}`,
    );
    input.push({
      tourPackageId: pick.id,
      tourSlug: pick.get("bookingSlug") || pick.get("slug") || "",
      displayName: name === "Kazhakstan" ? "Kazakhstan" : name,
      tourName: pick.get("name") ?? "",
      originalPrice: ladderRows[0].original,
      coverImage: pick.get("media")?.coverImage || undefined,
      order: order++,
      ladder: ladderRows.sort((a, b) => a.slot - b.slot).map((r) => r.discount),
    });
  }
  console.log(`\n${input.length} matched, ${unmatched.length} unmatched${unmatched.length ? ": " + unmatched.join(", ") : ""}`);

  if (flag !== "--write") return;
  const existingId = await getSaleIdBySlug(SLUG);
  const existing = existingId ? await getSale(existingId) : null;
  const id = await saveSale(
    existingId,
    {
      slug: SLUG,
      name: existing?.name || "Black Friday Sale 2026",
      status: existing?.status ?? "draft",
      startAt: existing?.startAt ?? "2026-11-01T00:00:00+00:00",
      endAt: existing?.endAt ?? null,
      holdMinutes: existing?.holdMinutes ?? 15,
      checkoutMode: existing?.checkoutMode ?? "auto",
      hero: existing?.hero ?? {
        title: "Black Friday Sale",
        subtitle: "Our biggest savings of the year on small-group tours. Limited slots per tour: the earlier you book, the more you save.",
      },
      tours: input,
    },
    "seed-script",
  );
  console.log(`Saved sale ${id} (slug "${SLUG}")`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
