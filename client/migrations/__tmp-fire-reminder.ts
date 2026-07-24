/**
 * DEV: re-fire the payment reminder trigger for a seeded booking.
 *
 * The trigger is idempotent — it skips when `sentInitialReminderLink` is
 * already set — so the test clears that first, then cycles
 * enablePaymentReminder false → true exactly as an admin toggling the switch
 * would.
 */
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase-config";

const BOOKING_ID = process.argv[2];

async function main() {
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "imheretravels-dev") {
    throw new Error("Refusing: not pointed at imheretravels-dev");
  }
  if (!BOOKING_ID) throw new Error("pass a booking document id");

  const ref = doc(db, "bookings", BOOKING_ID);
  const before = (await getDoc(ref)).data() as any;
  console.log(`booking ${BOOKING_ID}: ${before.fullName} <${before.emailAddress}>`);
  console.log(`  plan=${before.paymentPlan}  token=${!!before.access_token}`);
  console.log(`  previous link: ${before.sentInitialReminderLink || "(none)"}`);

  console.log("\n-> clearing sentInitialReminderLink + enablePaymentReminder=false");
  await updateDoc(ref, {
    sentInitialReminderLink: "",
    enablePaymentReminder: false,
  });

  await new Promise((r) => setTimeout(r, 5000));

  console.log("-> enablePaymentReminder=true (fires trigger)");
  await updateDoc(ref, { enablePaymentReminder: true });

  console.log("\nWaiting 60s for the Cloud Function…");
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const now = (await getDoc(ref)).data() as any;
    if (now.sentInitialReminderLink) {
      console.log(`\n✅ NEW reminder sent: ${now.sentInitialReminderLink}`);
      return;
    }
  }
  console.log("\n⚠️  no new link after 60s — check function logs");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
