/**
 * Seed the `incidents` and `policies` collections with the documents we've
 * already produced, so the new admin sections launch non-empty:
 *   - Incident: the FM012 disputed-booking case (summary + attached PDF report)
 *   - Policy:   the Customer Data Disclosure Policy (markdown body)
 *
 * Mirrors seed-destinations.ts: client SDK, config from admin/client/.env.local
 * (falls back to .env), dev-guarded unless --force. Idempotent — fixed doc IDs
 * are upserted, so re-running overwrites rather than duplicating.
 *
 * Usage (from admin/client):
 *   tsx scripts/seed-incidents-policies.ts          # dev only (guarded)
 *   tsx scripts/seed-incidents-policies.ts --force  # allow non-dev (e.g. prod)
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, Timestamp } from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Primary config from .env.local, fall back to .env (this repo uses .env).
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const FORCE = process.argv.includes("--force");

if (!firebaseConfig.projectId) {
  console.error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local / .env");
  process.exit(1);
}
if (firebaseConfig.projectId !== "imheretravels-dev" && !FORCE) {
  console.error(
    `Refusing to seed: project is "${firebaseConfig.projectId}" (not imheretravels-dev).`,
  );
  console.error("Re-run with --force to seed this project.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const DOCS = path.resolve(__dirname, "..", "docs");
const PDF_PATH = path.join(
  DOCS,
  "incidents",
  "2026-07-17-SB-IHF-20270319-FM012-fionnuala-mcdermott.pdf",
);
const POLICY_MD_PATH = path.join(
  DOCS,
  "support",
  "customer-data-disclosure-policy.md",
);

// Summary + actions are stored as HTML (authored via the WYSIWYG editor).
const INCIDENT_SUMMARY = `<p><strong>Disputed booking — customer claimed "I never made this booking" and asked for a refund of the £250 deposit.</strong></p><p>Investigation is evidence-complete; the booking and deposit are <strong>legitimate and non-fraudulent</strong>. The reservation was created via our public form and paid by hand: three different Irish Visa debit cards were tried (two declined for insufficient funds, a third succeeded). Stripe shows <strong>risk = normal</strong> on every attempt, CVC passed, and <strong>zero chargebacks</strong>. Stolen-card fraud is effectively ruled out.</p><p>The one thing we <strong>cannot</strong> prove is <em>whose</em> card paid — our checkout never captured the cardholder name — so it may be hers or a companion's.</p><p><strong>Disposition:</strong> deposit retained (T&amp;C, defensible); reminder emails frozen. The incident is <strong>OPEN</strong> pending customer resolution, the chargeback window (~to late Oct 2026), the booking's commercial disposition, and the root-cause fixes shipping. See the attached full report for the complete RCA and the approved (card-detail-free) customer reply.</p>`;

const INCIDENT_ACTIONS = `<h3>Bella / customer-facing</h3><ul><li>Send the approved, card-detail-free reply (facts-not-accusation; ask about a travel companion + request her bank screenshot).</li><li>Do not disclose any card details by email — direct card disputes to her bank.</li></ul><h3>Ops / management</h3><ul><li>Confirm deposit-retained and decide the booking's disposition (keep / cancel / release the 2027-03-19 seat).</li></ul><h3>Dev / product (so this can't recur)</h3><ul><li>P0: email/code verification before the Stripe step (root cause).</li><li>Re-order the reservation form; passport as a 2-step ID check; KYC.</li><li>Capture cardholder billing name at checkout; persist full attempt history; log booking provenance (IP/UA/createdVia).</li></ul>`;

async function seedIncident(now: Timestamp) {
  let attachment: Record<string, any> | null = null;

  if (fs.existsSync(PDF_PATH)) {
    try {
      const data = fs.readFileSync(PDF_PATH);
      const storagePath = "incidents/seed-fm012-report.pdf";
      const fileRef = storageRef(storage, storagePath);
      await uploadBytes(fileRef, data, { contentType: "application/pdf" });
      const url = await getDownloadURL(fileRef);
      attachment = {
        fileName: "seed-fm012-report.pdf",
        originalName: path.basename(PDF_PATH),
        fileDownloadURL: url,
        storagePath,
        contentType: "application/pdf",
        size: data.length,
      };
      console.log("  ↑ uploaded incident PDF");
    } catch (e) {
      // Best-effort — Storage rules may block an unauthenticated script upload.
      // Seed the incident doc anyway; the PDF can be attached via the UI.
      console.warn(
        `  ! PDF upload failed (${
          e instanceof Error ? e.message : e
        }) — seeding without attachment; attach it via the UI.`,
      );
    }
  } else {
    console.warn(`  ! PDF not found at ${PDF_PATH} — seeding without attachment`);
  }

  await setDoc(doc(db, "incidents", "seed-fm012"), {
    title: 'Disputed booking / "I never made this booking" (FM012)',
    incidentCode: "SB-IHF-20270319-FM012",
    category: "payments",
    severity: "high",
    status: "monitoring",
    summary: INCIDENT_SUMMARY,
    actionsNeeded: INCIDENT_ACTIONS,
    owner: "Bella / Dev",
    relatedRef: "SB-IHF-20270319-FM012",
    relatedBooking: {
      bookingDocId: "s1dAn3lCrgAVoTYbs6NA",
      bookingId: "SB-IHF-20270319-FM012",
      fullName: "Fionnuala McDermott",
      emailAddress: "fiomcdermott890@gmail.com",
      tourPackageName: "India Holi + Yoga with Dev",
      tourDate: "2027-03-19",
    },
    dateOccurred: "2026-06-29",
    dateReported: "2026-07-16",
    tags: ["stripe", "chargeback", "kyc", "email-verification", "payments"],
    attachment,
    metadata: { createdAt: now, updatedAt: now, createdBy: "seed" },
  });
  console.log("  ✔ incidents/seed-fm012");
}

async function seedPolicy(now: Timestamp) {
  // The policy body is stored as HTML (the editor is now WYSIWYG). Convert the
  // source markdown — including GFM tables — to HTML at seed time.
  const bodyMd = fs.existsSync(POLICY_MD_PATH)
    ? fs.readFileSync(POLICY_MD_PATH, "utf8")
    : "";
  if (!bodyMd) {
    console.warn(`  ! Policy markdown not found at ${POLICY_MD_PATH}`);
  }
  const body = bodyMd ? (marked.parse(bodyMd) as string) : "";

  await setDoc(doc(db, "policies", "seed-customer-data-disclosure"), {
    title: "Customer Data Disclosure Policy",
    category: "data-handling",
    status: "published",
    summary:
      "Field-by-field guide to what we can share with customers — never card details, tokens, internal IDs, or other people's info.",
    body,
    version: "1.0",
    effectiveDate: "2026-07-17",
    owner: "Admin",
    tags: ["gdpr", "cards", "support", "do's-and-don'ts"],
    metadata: { createdAt: now, updatedAt: now, createdBy: "seed" },
  });
  console.log("  ✔ policies/seed-customer-data-disclosure");
}

async function main() {
  console.log(`Seeding incidents + policies into "${firebaseConfig.projectId}"…`);
  const now = Timestamp.now();
  await seedIncident(now);
  await seedPolicy(now);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
