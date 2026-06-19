#!/usr/bin/env tsx

/**
 * Remove a discontinued payment method's content from the live `emailTemplates`.
 * Defaults to Revolut; pass `-- --method Ulster` for Ulster.
 *
 * Targets the customer-facing templates only:
 *   - Reservation Email          → removes the "PM… – <Method> …" <li> block
 *   - Initial Payment Reminder   → removes the {% elif paymentMethod == "<Method>" %} branch
 *   - Scheduled Reminder Email   → removes the {% elif paymentMethod === "<Method>" %} branch
 *
 * SAFE BY DEFAULT: dry-run unless `--apply`. On apply, each original `content`
 * is backed up to ./exports/email-backup-<id>-<ts>.html first.
 *
 * Usage (from admin/client):
 *   npm run migrate-remove-revolut-emails                          # dry-run, Revolut
 *   npm run migrate-remove-revolut-emails -- --apply               # APPLY, Revolut
 *   npm run migrate-remove-revolut-emails -- --method Ulster       # dry-run, Ulster
 *   npm run migrate-remove-revolut-emails -- --method Ulster --apply
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../migrations/firebase-config";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes("--apply");
const METHOD = argValue("--method") || "Revolut";
const methodRe = new RegExp(METHOD, "i");

// The <li> in the Reservation Email is labelled with the method's display name.
const LI_ANCHORS: Record<string, RegExp> = {
  Revolut: /Revolut\s+Business/i,
  Ulster: /Ulster\s+Bank\s+Transfer/i,
};
const liAnchor = LI_ANCHORS[METHOD] || new RegExp(`${METHOD}\\b`, "i");

type Mode = "elif" | "li";
const TARGETS: { id: string; name: string; mode: Mode }[] = [
  { id: "BnRGgT6E8SVrXZH961LT", name: "Reservation Email", mode: "li" },
  { id: "DisPYJPnL01OmomT8Mch", name: "Initial Payment Reminder", mode: "elif" },
  { id: "GEB3llGzftDaWRFXj8qz", name: "Scheduled Reminder Email", mode: "elif" },
];

/** Remove a `{% elif paymentMethod == "<Method>" %} … ` branch up to the next control tag. */
function removeElif(content: string): { result: string; removed: string } {
  const elifRe = new RegExp(
    `{%\\s*elif\\s+paymentMethod\\s*===?\\s*["']${METHOD}["']\\s*%}`,
    "i"
  );
  const m = elifRe.exec(content);
  if (!m) return { result: content, removed: "" };
  const start = m.index;
  const nextRe = /{%\s*(elif|else|endif)\b/gi;
  nextRe.lastIndex = start + m[0].length;
  const n = nextRe.exec(content);
  const end = n ? n.index : content.length;
  return {
    removed: content.slice(start, end),
    result: content.slice(0, start) + content.slice(end),
  };
}

/** Remove the `<li> … <Method label> … </li>` element (+ a trailing <br /> separator). */
function removeLi(content: string): { result: string; removed: string } {
  const idx = content.search(liAnchor);
  if (idx < 0) return { result: content, removed: "" };
  const liStart = content.lastIndexOf("<li", idx);
  const liEnd = content.indexOf("</li>", idx);
  if (liStart < 0 || liEnd < 0) return { result: content, removed: "" };
  let end = liEnd + "</li>".length;
  const br = /^\s*<br\s*\/?>/i.exec(content.slice(end));
  if (br) end += br[0].length;
  return {
    removed: content.slice(liStart, end),
    result: content.slice(0, liStart) + content.slice(end),
  };
}

const clip = (s: string, n = 400) =>
  s.replace(/\s+/g, " ").trim().slice(0, n) + (s.length > n ? " …" : "");

async function main() {
  console.log(
    `\n✉️  Remove ${METHOD} from email templates  [${APPLY ? "APPLY (writes live)" : "DRY-RUN (no writes)"}]`
  );
  console.log(`📦 ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);

  const exportsDir = join(process.cwd(), "exports");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  let changed = 0;

  for (const t of TARGETS) {
    const ref = doc(db, "emailTemplates", t.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.log(`⚠️  ${t.name} (${t.id}) not found — skipping.`);
      continue;
    }
    const content: string = (snap.data() as any).content ?? "";
    const { result, removed } =
      t.mode === "li" ? removeLi(content) : removeElif(content);

    console.log("━".repeat(80));
    console.log(`${t.name}  (${t.id})`);
    if (!removed) {
      console.log(`  • No ${METHOD} block found (already clean?). No change.`);
      continue;
    }
    if (methodRe.test(result)) {
      console.log(
        `  ⚠ '${METHOD}' still present after removal — NOT changing. Inspect manually.`
      );
      continue;
    }
    changed++;
    const spliceAt = content.indexOf(removed);
    console.log(`  content length: ${content.length} → ${result.length} (removed ${content.length - result.length} chars)`);
    console.log(`  REMOVED: ${clip(removed)}`);
    console.log(`  RESULT around splice: …${clip(result.slice(Math.max(0, spliceAt - 90), spliceAt + 90), 240)}…`);

    if (APPLY) {
      mkdirSync(exportsDir, { recursive: true });
      writeFileSync(join(exportsDir, `email-backup-${t.id}-${ts}.html`), content);
      await updateDoc(ref, { content: result });
      console.log(`  ✅ Updated (original backed up to exports/email-backup-${t.id}-${ts}.html)`);
    }
  }

  console.log("━".repeat(80));
  if (!APPLY) {
    console.log(`\nDRY-RUN — ${changed} template(s) would change. Re-run with \`-- --apply\`.`);
  } else {
    console.log(`\nDone. Updated ${changed} template(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  });
