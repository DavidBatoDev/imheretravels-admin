#!/usr/bin/env tsx

/**
 * READ-ONLY. Finds Revolut references inside the live `emailTemplates` collection
 * and prints, per template, the document id, name, which string field contains
 * "revolut", and the surrounding snippet(s) — so removals can be crafted exactly.
 *
 * Usage (from admin/client):  npx tsx src/scripts/inspect-revolut-emails.ts
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "../../migrations/firebase-config";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const TERM = argValue("--term") || "revolut";
const RE = new RegExp(TERM, "i");

function snippets(text: string, ctx = 220): string[] {
  const out: string[] = [];
  const re = new RegExp(TERM, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = Math.max(0, m.index - ctx);
    const end = Math.min(text.length, m.index + ctx);
    out.push(text.slice(start, end));
    re.lastIndex = end; // skip overlapping windows
  }
  return out;
}

async function main() {
  console.log(`📦 ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
  const snap = await getDocs(collection(db, "emailTemplates"));
  console.log(`Fetched ${snap.size} email templates\n`);

  snap.forEach((doc) => {
    const data: any = { id: doc.id, ...doc.data() };
    const hitFields = Object.keys(data).filter(
      (k) => typeof data[k] === "string" && RE.test(data[k])
    );
    if (hitFields.length === 0) return;

    console.log("━".repeat(80));
    console.log(`id:      ${data.id}`);
    console.log(`name:    ${data.name}`);
    console.log(`status:  ${data.status}`);
    console.log(`fields with "revolut": ${hitFields.join(", ")}`);
    for (const f of hitFields) {
      const snips = snippets(data[f]);
      console.log(`\n  ── field "${f}" (${snips.length} hit(s)) ──`);
      snips.forEach((s, i) => {
        console.log(`  [${i + 1}] …${s.replace(/\s+/g, " ").trim()}…`);
      });
    }
    console.log("");
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  });
