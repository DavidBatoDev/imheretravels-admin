/**
 * End-to-end check of a Black Friday sale payment against DEV Firestore and
 * Stripe TEST mode, without a browser:
 *   claim 2 slots → draft payment doc → init sale payment (server-priced) →
 *   Pay pressed → confirm with a test card → booking creation (the webhook's
 *   path) → slots sold, bookings priced per slot → cleanup + refund.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/sale-e2e-test.ts
 */
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import { adminUpdateSlot, claimSlots, markPaying } from "@/lib/sale/holds";
import { initSaleReservationPayment } from "@/lib/sale/payment";
import { getSaleIdBySlug } from "@/lib/sale/sales";
import { SALE_COL, inventoryRef, toMs } from "@/lib/sale/store";
import { createBookingsForReservationPayment } from "@/lib/create-bookings-from-payment";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

async function main() {
  if (process.env.FIREBASE_PROJECT_ID !== "imheretravels-dev") throw new Error("dev only");
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Stripe test mode only");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = adminDb();

  const saleId = await getSaleIdBySlug("black-friday");
  if (!saleId) throw new Error('Seed the dev "black-friday" sale first');
  const sale = (await db.collection(SALE_COL.events).doc(saleId).get()).data()!;
  const saleTour = sale.tours[0];
  const tour = (await db.collection("tourPackages").doc(saleTour.tourPackageId).get()).data()!;
  const date = (tour.travelDates ?? []).find((d: { isAvailable?: boolean; startDate: unknown }) => d.isAvailable !== false && (toMs(d.startDate) ?? 0) > Date.now());
  if (!date) throw new Error("No future date on " + saleTour.tourName);
  const dateKey = new Date(toMs(date.startDate)!).toISOString().slice(0, 10);

  const before = (await inventoryRef(saleId, saleTour.tourPackageId).get()).get("slots") as { index: number; status: string; salePrice: number }[];
  const email = `e2e-${Date.now()}@example.com`;
  const created: { payDoc?: string; holdId?: string; intent?: string; bookings: string[]; slots: number[] } = { bookings: [], slots: [] };

  try {
    // 1. Claim a duo.
    const hold = await claimSlots({ saleId, tourPackageId: saleTour.tourPackageId, partySize: 2, email });
    created.holdId = hold.holdId;
    created.slots = hold.slots.map((s) => s.index);
    console.log(`held slots ${created.slots.join(",")} at ${hold.slots.map((s) => "£" + s.salePrice).join(" + ")}`);

    // 2. The form's draft payment doc (shape from reservationDraftPayload.ts), with a tampered amount.
    const payRef = db.collection("stripePayments").doc();
    created.payDoc = payRef.id;
    await payRef.set({
      id: payRef.id,
      customer: { email, firstName: "E2E", lastName: "Lead", birthdate: "1990-01-01", nationality: "GB", whatsAppNumber: "" },
      booking: {
        type: "Duo Booking",
        groupSize: 2,
        guestDetails: [{ email: `guest-${email}`, firstName: "E2E", lastName: "Guest", birthdate: "1990-01-01", nationality: "GB", whatsAppNumber: "" }],
        id: "PENDING",
        documentId: "",
      },
      tour: { packageId: saleTour.tourPackageId, packageName: tour.name, date: dateKey },
      payment: { amount: 1, currency: "GBP", status: "reserve_pending", type: "reservationFee" },
      timestamps: { createdAt: FieldValue.serverTimestamp() },
    });

    // 3. init-payment's sale branch prices the fee on the server.
    const init = await initSaleReservationPayment({ holdParam: `${hold.holdId}.${hold.token}`, paymentDocId: payRef.id, email });
    const intentId = init.clientSecret.split("_secret_")[0];
    created.intent = intentId;
    const perPerson = date.hasCustomDeposit === true && typeof date.customDeposit === "number" ? date.customDeposit : (tour.pricing?.deposit ?? 250);
    check(init.amountGBP === perPerson * 2, `fee is server-priced: £${init.amountGBP} = £${perPerson} × 2 (client sent £1)`);
    const pi = await stripe.paymentIntents.retrieve(intentId);
    check(pi.metadata.holdId === hold.holdId && pi.amount === Math.round(init.amountGBP * 100), "intent carries the hold and the server amount");

    // 4. Pay pressed, then the card is confirmed.
    const paying = await markPaying(hold.holdId, hold.token);
    check(paying.paying, "Pay locks the hold (paying)");
    const confirmed = await stripe.paymentIntents.confirm(intentId, { payment_method: "pm_card_visa" });
    check(confirmed.status === "succeeded", `test card payment ${confirmed.status}`);

    // 5. What the webhook does on payment_intent.succeeded.
    await payRef.update({ "payment.status": "reserve_paid" });
    const result = await createBookingsForReservationPayment({ paymentDocId: payRef.id, creationLock: "webhook" });
    if (!result.alreadyExists) created.bookings = result.bookingDocumentIds;

    const after = (await inventoryRef(saleId, saleTour.tourPackageId).get()).get("slots") as { index: number; status: string; holdId: string; bookingIds?: string[]; stripeIntentId?: string }[];
    const mine = after.filter((s) => created.slots.includes(s.index));
    check(mine.every((s) => s.status === "sold" && s.stripeIntentId === intentId), "held slots are now sold with the payment recorded");
    check(mine.every((s) => (s.bookingIds ?? []).length === 1), "each sold slot links its traveller's booking");
    const holdDoc = await db.collection(SALE_COL.holds).doc(hold.holdId).get();
    check(holdDoc.get("status") === "converted", "hold converted");

    const bookings = await Promise.all(created.bookings.map((id) => db.collection("bookings").doc(id).get()));
    const sorted = [...hold.slots].sort((a, b) => a.index - b.index);
    bookings.forEach((b, i) => {
      check(
        b.get("discountedTourCost") === sorted[i].salePrice && b.get("saleSlotIndex") === sorted[i].index && b.get("lockPricing") === true,
        `traveller ${i + 1}: slot ${b.get("saleSlotIndex")} £${b.get("discountedTourCost")}, balance £${b.get("remainingBalance")}`,
      );
    });
  } finally {
    // Cleanup: refund, delete test docs, reopen the slots.
    if (created.intent) {
      await stripe.refunds.create({ payment_intent: created.intent }).catch(() => {});
      await stripe.paymentIntents.cancel(created.intent).catch(() => {});
    }
    for (const id of created.bookings) await db.collection("bookings").doc(id).delete();
    if (created.payDoc) await db.collection("stripePayments").doc(created.payDoc).delete();
    for (const idx of created.slots) await adminUpdateSlot(saleId, saleTour.tourPackageId, idx, { action: "reopen" });
    if (created.holdId) await db.collection(SALE_COL.holds).doc(created.holdId).delete();
    const restored = (await inventoryRef(saleId, saleTour.tourPackageId).get()).get("slots") as { index: number; status: string }[];
    check(
      JSON.stringify(restored.map((s) => s.status)) === JSON.stringify(before.map((s) => s.status)),
      "cleanup restored the slot states",
    );
  }
  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("E2E sale payment checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
