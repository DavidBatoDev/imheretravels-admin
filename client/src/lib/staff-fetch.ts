import { auth } from "@/lib/firebase";

/**
 * `fetch` for staff-only API routes: adds the signed-in user's Firebase ID
 * token as `Authorization: Bearer …`, which `requireStaff` verifies.
 *
 * Waits for Firebase to restore the session first, so calls made on page load
 * don't fail before `auth.currentUser` is set.
 */
export async function staffFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in");
  }
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
