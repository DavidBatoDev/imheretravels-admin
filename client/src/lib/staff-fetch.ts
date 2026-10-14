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

/**
 * Gmail attachment previews can't be loaded with a plain `<img src>` or
 * iframe URL any more (those requests carry no token). Fetch the preview with
 * the token and hand back a `blob:` URL the browser can display.
 *
 * Callers own the URL: revoke it with `URL.revokeObjectURL` when it is no
 * longer shown.
 */
export async function fetchAttachmentObjectUrl(
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const response = await staffFetch(
    `/api/gmail/attachments/${messageId}/${attachmentId}?preview=true`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load attachment (${response.status})`);
  }
  return URL.createObjectURL(await response.blob());
}

/**
 * Like fetchAttachmentObjectUrl, but returns a `data:` URL. Use this for
 * images that end up inside an email body: a data URL survives being saved
 * as a draft or sent, while a `blob:` URL only lives in this tab.
 */
export async function fetchAttachmentDataUrl(
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const response = await staffFetch(
    `/api/gmail/attachments/${messageId}/${attachmentId}?preview=true`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load attachment (${response.status})`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
