import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (getApps().length === 0) {
  initializeApp({ credential: cert(path.resolve(__dirname, "../keys/dev-project-service-account.json")) });
}
const db = getFirestore();
const snap = await db.collection("tourPackages").get();
let withReviews = 0;
for (const d of snap.docs) {
  const reviews = d.data()?.details?.reviews;
  if (Array.isArray(reviews) && reviews.length > 0) {
    withReviews++;
    console.log(d.id, "->", reviews.length, "embedded reviews");
  }
}
console.log(`Tours with embedded reviews: ${withReviews} / ${snap.size}`);
process.exit(0);
