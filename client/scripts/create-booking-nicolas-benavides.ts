/**
 * One-off: create the booking for Nicolas Benavides, who paid his £250
 * reservation fee for Brazil's Treasures with Breanna & Jordan (27 Dec 2026)
 * through a Stripe Payment Link on 2026-09-30 (pi_3ULP12Fv3pifuM660qE5FdKC),
 * so no booking was created automatically.
 *
 * Builds the record with the same createBookingData() the reservation form uses.
 * Sends no email: every booking email trigger fires on an update, not a create.
 *
 * Usage: npx tsx scripts/create-booking-nicolas-benavides.ts --prod [--write]
 */
import crypto from "crypto";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import { createBookingData, getEligible2ndOfMonths, getPaymentCondition, getDaysBetweenDates, normalizeTourDateToUTCPlus8Nine } from "../src/lib/booking-calculations";

const WRITE = process.argv.includes("--write");
const TOUR_ID = "3wyI9Va8HEyzrMVMZx09";
const EMAIL = "nbl0357@gmail.com";
const PAID_AT = new Date("2026-09-30T00:00:00.000Z");
const PI = "pi_3ULP12Fv3pifuM660qE5FdKC";

const { db, projectId } = initFirestore(targetFromArgv());
const { Timestamp, FieldValue } = admin.firestore;

(async () => {
  const tour = (await db.collection("tourPackages").doc(TOUR_ID).get()).data()!;
  if (tour.name !== "Brazil's Treasures with Breanna & Jordan") throw new Error("unexpected tour: " + tour.name);

  const already = await db.collection("bookings").where("emailAddress", "==", EMAIL).get();
  if (!already.empty) throw new Error(`booking already exists for ${EMAIL}: ${already.docs.map((d) => d.get("bookingId")).join(", ")}`);

  const existingForTour = (await db.collection("bookings").where("tourPackageName", "==", tour.name).get()).size;
  const rows = new Set<number>();
  (await db.collection("bookings").select("row").get()).forEach((d) => { const r = d.get("row"); if (typeof r === "number") rows.add(r); });
  let nextRow = 1; while (rows.has(nextRow)) nextRow++;

  const tourDate = new Date("2026-12-27T12:00:00.000Z");
  const data = await createBookingData({
    email: EMAIL, firstName: "Nicolas", lastName: "Benavides",
    bookingType: "Single Booking", tourPackageName: tour.name, tourCode: tour.tourCode, tourId: TOUR_ID,
    tourDate, returnDate: "2027-01-02", tourDuration: tour.duration,
    reservationFee: 250, paidAmount: 250, originalTourCost: 1699, discountedTourCost: null,
    paymentMethod: "Stripe", groupId: "", isMainBooking: true,
    existingBookingsCount: existingForTour, totalBookingsCount: nextRow - 1,
  } as any);

  // Eligibility is computed from "now"; check it matches what the 30 Sep payment date gives.
  const norm = normalizeTourDateToUTCPlus8Nine(tourDate) ?? tourDate;
  const condAtPaid = getPaymentCondition(norm, getEligible2ndOfMonths(PAID_AT, norm), getDaysBetweenDates(PAID_AT, norm));

  const doc = {
    ...data,
    tourDate: Timestamp.fromDate(data.tourDate as Date),
    reservationDate: Timestamp.fromDate(PAID_AT),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    priceSnapshotDate: FieldValue.serverTimestamp(),
    tourPackagePricingVersion: tour.currentVersion || 1, priceSource: "snapshot", lockPricing: true,
    reservationAmountPaid: 250, paidTerms: 0, paymentProgress: "0%",
    access_token: crypto.randomBytes(32).toString("base64url"),
  };

  const shown = { ...doc, access_token: "<generated>", tourDate: (data.tourDate as Date).toISOString(), reservationDate: PAID_AT.toISOString(), createdAt: "<server time>", updatedAt: "<server time>", priceSnapshotDate: "<server time>" };
  console.log(`project: ${projectId} | mode: ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`payment condition now: ${data.paymentCondition} | as of 30 Sep: ${condAtPaid}`);
  console.log(JSON.stringify(shown, null, 1));

  if (!WRITE) { console.log("\nDry run only — re-run with --write to create."); process.exit(0); }
  if (condAtPaid !== data.paymentCondition) throw new Error("payment condition differs between today and 30 Sep — review before writing");
  const ref = await db.collection("bookings").add(doc);
  console.log(`\nCreated bookings/${ref.id} (${data.bookingId}) — Stripe ${PI}`);
  process.exit(0);
})();
