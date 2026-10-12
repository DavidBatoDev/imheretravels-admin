import "server-only";

import { requireStaff } from "@/lib/require-staff";

/**
 * Server-side guard for admin-only API mutations.
 *
 * Builds on requireStaff (ID token verified, `users` doc loaded through
 * firebase-admin, account approved), then requires `role === "admin"`.
 * Incidents & Policies are read by all approved staff but only writable by
 * admins — this enforces that on the API, not just in the UI.
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
  const staff = await requireStaff(authorizationHeader);
  if (!staff.ok) {
    return staff.status === 403
      ? { ok: false, status: 403, error: "Admin access required" }
      : staff;
  }
  if (staff.role !== "admin") {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return { ok: true, uid: staff.uid };
}
