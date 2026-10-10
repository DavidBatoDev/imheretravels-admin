import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-only Firestore via firebase-admin, for data that must never reach
 * the browser (it bypasses security rules, so callers authorise first).
 *
 * Uses a named app so it can't collide with the verification-only default app
 * that firebase-admin-auth.ts may create. Refuses to start when the service
 * account belongs to a different project than the client config, so a dev
 * credential can never silently read/write the wrong database.
 */
const APP_NAME = "server-db";

function getServerDbApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("firebase-admin-db: FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY are not set");
  }
  if (clientProjectId && clientProjectId !== projectId) {
    throw new Error(
      `firebase-admin-db: service account project (${projectId}) does not match client project (${clientProjectId})`,
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, APP_NAME);
}

let db: Firestore | undefined;

export function adminDb(): Firestore {
  db ??= getFirestore(getServerDbApp());
  return db;
}
