/**
 * Race test for Black Friday slot holds against the DEV Firestore project.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/sale-race-test.ts
 *
 * Creates a throwaway live sale with one tour and a 4-slot ladder, fires
 * concurrent claims with mixed party sizes, and checks that no slot is ever
 * held twice and nothing oversells. Then checks lazy expiry and release, and
 * deletes everything it created. Refuses to run against any project but dev.
 */
import { adminDb } from "@/lib/firebase-admin-db";
import { SaleError, claimSlots, markPaying, releaseHold } from "@/lib/sale/holds";
import { SALE_COL, inventoryRef, saleRef, tsFromMs } from "@/lib/sale/store";
import { saveSale } from "@/lib/sale/sales";

async function main() {
  if (process.env.FIREBASE_PROJECT_ID !== "imheretravels-dev") {
    throw new Error(`Refusing to run against ${process.env.FIREBASE_PROJECT_ID}; dev only.`);
  }
  const db = adminDb();
  const tourSnap = await db.collection("tourPackages").where("status", "==", "active").limit(1).get();
  if (tourSnap.empty) throw new Error("No active tour in dev");
  const tour = tourSnap.docs[0];
  const slug = `race-test-${Date.now()}`;

  const saleId = await saveSale(
    null,
    {
      slug,
      name: "Race test",
      status: "live",
      startAt: null,
      endAt: null,
      holdMinutes: 15,
      checkoutMode: "auto",
      hero: { title: "t", subtitle: "s" },
      tours: [
        {
          tourPackageId: tour.id,
          tourSlug: tour.get("slug") ?? "",
          displayName: "Race",
          tourName: tour.get("name") ?? "",
          originalPrice: 2199,
          order: 0,
          ladder: [500, 300, 200, 100],
        },
      ],
    },
    "race-test",
  );
  const holdIds: string[] = [];
  let failures = 0;

  try {
    // 1. Concurrency: 20 claims, party sizes 1-3, distinct emails.
    const sizes = Array.from({ length: 20 }, (_, i) => (i % 3) + 1);
    const results = await Promise.allSettled(
      sizes.map((partySize, i) =>
        claimSlots({ saleId, tourPackageId: tour.id, partySize, email: `race${i}@example.com` }),
      ),
    );
    const won = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof claimSlots>>>).value);
    const lost = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
    holdIds.push(...won.map((w) => w.holdId));
    const unexpected = lost.filter((e) => !(e instanceof SaleError && e.code === "not_enough_slots"));
    const heldSlots = won.flatMap((w) => w.slots.map((s) => s.index));
    const unique = new Set(heldSlots);
    const inv = (await inventoryRef(saleId, tour.id).get()).get("slots") as { index: number; holdId: string; status: string }[];
    console.log(`claims: ${won.length} won, ${lost.length} refused; slots held ${[...heldSlots].sort().join(",")}`);
    const check = (ok: boolean, msg: string) => {
      console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
      if (!ok) failures++;
    };
    check(unexpected.length === 0, `only "not_enough_slots" refusals (${unexpected.map(String).join("; ") || "none"})`);
    check(unique.size === heldSlots.length, "no slot held by two claims");
    check(heldSlots.length <= 4, "never more than 4 slots held");
    check(
      won.every((w) => w.slots.every((s) => inv.find((x) => x.index === s.index)?.holdId === w.holdId)),
      "inventory matches every winning hold",
    );

    // 2. Lazy expiry: age one hold out; the next claim must take its slots back.
    const victim = won[0];
    const slots = (await inventoryRef(saleId, tour.id).get()).get("slots") as Record<string, unknown>[];
    await inventoryRef(saleId, tour.id).update({
      slots: slots.map((s) => (s.holdId === victim.holdId ? { ...s, heldUntil: tsFromMs(Date.now() - 1000) } : s)),
    });
    const retake = await claimSlots({ saleId, tourPackageId: tour.id, partySize: victim.partySize, email: "late@example.com" });
    holdIds.push(retake.holdId);
    check(
      retake.slots.map((s) => s.index).join() === victim.slots.map((s) => s.index).join(),
      "expired hold's slots are reclaimed by the next claim",
    );
    const victimDoc = await db.collection(SALE_COL.holds).doc(victim.holdId).get();
    check(victimDoc.get("status") === "expired", "reclaimed hold is marked expired");
    let expiredPayRefused = false;
    try {
      await markPaying(victim.holdId, victim.token);
    } catch (e) {
      expiredPayRefused = e instanceof SaleError && e.status === 410;
    }
    check(expiredPayRefused, "the expired holder can no longer press Pay");

    // 3. Same email claims again: the earlier hold is released, not duplicated.
    const again = await claimSlots({ saleId, tourPackageId: tour.id, partySize: 1, email: "late@example.com" });
    holdIds.push(again.holdId);
    const first = await db.collection(SALE_COL.holds).doc(retake.holdId).get();
    check(first.get("status") === "released", "one active hold per email");

    // 4. Pay locks the hold: the customer can't release it mid-payment.
    await markPaying(again.holdId, again.token);
    let releaseRefused = false;
    try {
      await releaseHold(again.holdId, again.token, "test");
    } catch (e) {
      releaseRefused = e instanceof SaleError && e.code === "hold_in_payment";
    }
    check(releaseRefused, "a paying hold can't be released by the customer");
  } finally {
    for (const id of holdIds) await db.collection(SALE_COL.holds).doc(id).delete();
    await inventoryRef(saleId, tour.id).delete();
    await saleRef(saleId).delete();
    const rl = await db.collection(SALE_COL.rateLimits).get();
    console.log(`cleaned up sale ${saleId} and ${holdIds.length} holds (rate-limit docs: ${rl.size}, left for TTL)`);
  }
  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("All race checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
