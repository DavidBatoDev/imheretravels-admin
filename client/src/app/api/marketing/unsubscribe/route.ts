// app/api/marketing/unsubscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Public unsubscribe endpoint for marketing/follow-up emails.
 *
 * POST — used by the /unsubscribe page and by RFC 8058 one-click
 * (List-Unsubscribe-Post). Token comes from the query string or JSON body.
 * GET — flips the contact then redirects to the confirmation page
 * (the List-Unsubscribe header URL, opened by mail clients that use GET).
 *
 * Unknown tokens still return a success-shaped response so the endpoint
 * cannot be used to probe list membership.
 */

async function unsubscribeByToken(token: string): Promise<boolean> {
  const contactQuery = query(
    collection(db, "marketingContacts"),
    where("unsubscribeToken", "==", token),
    limit(1)
  );
  const snapshot = await getDocs(contactQuery);

  if (snapshot.empty) {
    console.warn("Unsubscribe: unknown token");
    return false;
  }

  const contactDoc = snapshot.docs[0];
  if (contactDoc.data().status !== "unsubscribed") {
    await updateDoc(contactDoc.ref, {
      status: "unsubscribed",
      unsubscribedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return true;
}

async function extractToken(req: NextRequest): Promise<string> {
  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken) return queryToken;

  // One-click unsubscribe POSTs form data; the page POSTs JSON
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      return typeof body?.token === "string" ? body.token : "";
    }
  } catch {
    // Malformed/empty body — fall through
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const token = await extractToken(req);

    if (!token) {
      return NextResponse.json(
        { error: "Missing token" },
        { status: 400 }
      );
    }

    await unsubscribeByToken(token);

    // Success-shaped regardless of whether the token matched
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing unsubscribe:", error);
    return NextResponse.json(
      { error: "Failed to process unsubscribe" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  try {
    if (token) {
      await unsubscribeByToken(token);
    }
  } catch (error) {
    console.error("Error processing unsubscribe:", error);
  }

  return NextResponse.redirect(new URL("/unsubscribe?done=1", req.url));
}
