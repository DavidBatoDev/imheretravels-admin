import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { verifyRequestUserId } from "@/lib/firebase-admin-auth";

/**
 * Server-side guard for admin-only API mutations.
 *
 * Verifies the request's Firebase ID token, then loads the caller's `users`
 * doc and confirms `role === "admin"`. Incidents & Policies are read by all
 * approved staff but only writable by admins — this enforces that on the API,
 * not just in the UI.
 *
 * Returns the caller's uid when they are an admin, otherwise a `{ status,
 * error }` describing why (401 unauthenticated / 403 not an admin).
 */
export type RequireAdminResult =
  | { ok: true; uid: string }
  | { ok: false; status: number; error: string };

export async function requireAdmin(
  authorizationHeader: string | null,
): Promise<RequireAdminResult> {
  const uid = await verifyRequestUserId(authorizationHeader);
  if (!uid) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    const role = snap.exists() ? (snap.data() as { role?: string }).role : null;
    if (role !== "admin") {
      return {
        ok: false,
        status: 403,
        error: "Admin access required",
      };
    }
    return { ok: true, uid };
  } catch (error) {
    console.error("requireAdmin: failed to load user role", error);
    return { ok: false, status: 500, error: "Failed to verify permissions" };
  }
}
