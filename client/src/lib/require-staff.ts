import "server-only";

import { verifyRequestUserId } from "@/lib/firebase-admin-auth";
import { adminDb } from "@/lib/firebase-admin-db";

/**
 * Server-side guard for staff-only API routes.
 *
 * Verifies the request's Firebase ID token, then loads the caller's `users`
 * doc through firebase-admin (not the client SDK, so it keeps working once
 * Firestore rules are locked down) and requires an approved admin or agent.
 */
export type RequireStaffResult =
  | { ok: true; uid: string; role: "admin" | "agent" }
  | { ok: false; status: number; error: string };

export async function requireStaff(
  authorizationHeader: string | null,
): Promise<RequireStaffResult> {
  const uid = await verifyRequestUserId(authorizationHeader);
  if (!uid) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  try {
    const snap = await adminDb().collection("users").doc(uid).get();
    const data = snap.data() as { role?: string; isApproved?: boolean } | undefined;
    const role = data?.role;
    if (!data?.isApproved || (role !== "admin" && role !== "agent")) {
      return { ok: false, status: 403, error: "Approved staff access required" };
    }
    return { ok: true, uid, role };
  } catch (error) {
    console.error("requireStaff: failed to load user", error);
    return { ok: false, status: 500, error: "Failed to verify permissions" };
  }
}
