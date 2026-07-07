// One-off dev-only seed: create a single Completed booking for the
// "Maldives Bucketlist" tour so the /reviews write-a-review smoke test has
// an eligible booking to verify against on imheretravels-dev.
// Uses the existing NEXT_PUBLIC_FIREBASE_* client config (already dev) and
// relies on the currently-open (test mode) firestore.rules to allow the write.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (firebaseConfig.projectId !== "imheretravels-dev") {
  console.error("Refusing to seed: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not imheretravels-dev:", firebaseConfig.projectId);
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BOOKING_DOC_ID = "dev-seed-review-completed-1";
const tourDate = new Date();
tourDate.setDate(tourDate.getDate() - 14); // tour happened 2 weeks ago
const reservationDate = new Date();
reservationDate.setDate(reservationDate.getDate() - 44);

const booking = {
  id: BOOKING_DOC_ID,
  bookingId: "DEV-SEED-0001",
  bookingCode: "DEVSEED0001",
  tourCode: "MLB",
  reservationDate,
  bookingType: "Individual",
  bookingStatus: "Completed",
  daysBetweenBookingAndTour: 30,
  isMainBooker: true,

  travellerInitials: "JD",
  firstName: "Jamie",
  lastName: "Dev",
  fullName: "Jamie Dev",
  emailAddress: "dev-reviewer@imheretravels.com",

  tourPackageNameUniqueCounter: 1,
  tourPackageName: "Maldives Bucketlist",
  formattedDate: tourDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  tourDate,
  tourDuration: "8 Days and 7 Nights",

  originalTourCost: 1200,
  paid: 1200,
  remainingBalance: 0,
  paymentProgress: 100,

  includeBccReservation: false,
  generateEmailDraft: false,
  sendEmail: false,
  enablePaymentReminder: false,
  eligible2ndOfMonths: false,
  includeBccCancellation: false,
  generateCancellationEmailDraft: false,
  sendCancellationEmail: false,
};

await setDoc(doc(db, "bookings", BOOKING_DOC_ID), booking);
console.log(`Seeded bookings/${BOOKING_DOC_ID} (status=Completed, tourPackageName="${booking.tourPackageName}") on ${firebaseConfig.projectId}`);
process.exit(0);
