/**
 * Explicit Firebase project selection for scripts.
 *
 * .env.local carries both projects' credentials — one block active, one
 * commented — and which is which has been flipped back and forth. Reading
 * whatever happens to be uncommented makes a script's target invisible at the
 * call site, which is how you run a "dev" migration against production.
 *
 * This parses BOTH blocks and picks by explicit intent: `--prod` / `--dev` on
 * the command line. There is no default; a script must state its target.
 */
import fs from "fs";
import path from "path";
import admin from "firebase-admin";

export type Target = "dev" | "prod";

interface Creds {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;

/** Parse every occurrence of a key, active or commented, in file order. */
function readAll(raw: string, key: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*#?\\s*${key}\\s*=\\s*(.*)$`));
    if (m) out.push(m[1].trim().replace(/^["']|["']$/g, ""));
  }
  return out;
}

export function loadCredentials(target: Target): Creds {
  const file = path.resolve(__dirname, "..", "..", ".env.local");
  const raw = fs.readFileSync(file, "utf8");

  const [ids, emails, keys] = KEYS.map((k) => readAll(raw, k));
  if (ids.length !== emails.length || ids.length !== keys.length) {
    throw new Error(
      `.env.local is malformed: found ${ids.length} project ids, ${emails.length} client emails, ${keys.length} private keys — each block must define all three.`,
    );
  }

  // Blocks appear in the same order for every key, so index i is one block.
  const idx = ids.findIndex((id) => id.includes("dev") === (target === "dev"));
  if (idx === -1) {
    throw new Error(`No ${target} credentials found in .env.local (saw: ${ids.join(", ")})`);
  }

  return {
    projectId: ids[idx],
    clientEmail: emails[idx],
    privateKey: keys[idx].replace(/\\n/g, "\n"),
  };
}

/** Reads --prod / --dev from argv. Throws if neither or both are given. */
export function targetFromArgv(argv = process.argv): Target {
  const prod = argv.includes("--prod");
  const dev = argv.includes("--dev");
  if (prod && dev) throw new Error("Pass only one of --prod / --dev.");
  if (!prod && !dev) throw new Error("Target required: pass --dev or --prod.");
  return prod ? "prod" : "dev";
}

/** Initialises firebase-admin against an explicitly chosen project. */
export function initFirestore(target: Target) {
  const creds = loadCredentials(target);
  const label = target.toUpperCase();
  console.log("=".repeat(72));
  console.log(`  TARGET: ${label}  (${creds.projectId})`);
  console.log("=".repeat(72));
  admin.initializeApp({
    credential: admin.credential.cert(creds),
    projectId: creds.projectId,
  });
  return { db: admin.firestore(), projectId: creds.projectId, label };
}
