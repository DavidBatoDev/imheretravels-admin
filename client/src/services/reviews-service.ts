/**
 * Client-side service for the `tourReviews` collection (admin dashboard).
 *
 * Reads via realtime `onSnapshot`; writes via the client SDK (Firestore rules
 * allow authenticated admin access). After each mutation we ping a tiny server
 * route that triggers www ISR revalidation so the public site updates promptly.
 */

import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  limit,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ReviewDoc, ReviewStatus, NewAdminReview, CategoryRatings } from "@/types/reviews";

const COLLECTION = "tourReviews";

function toMillis(v: any): number {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  return typeof v === "number" ? v : 0;
}

/** Subscribe to all reviews (newest first, sorted client-side). */
export function subscribeToReviews(
  onData: (reviews: ReviewDoc[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(collection(db, COLLECTION));
  return onSnapshot(
    q,
    (snap) => {
      const rows: ReviewDoc[] = snap.docs.map((d) => {
        const raw = d.data() as any;
        return {
          id: d.id,
          tourId: raw.tourId ?? "",
          tourSlug: raw.tourSlug ?? "",
          tourName: raw.tourName ?? "",
          rating: typeof raw.rating === "number" ? raw.rating : Number(raw.rating) || 5,
          categoryRatings:
            raw.categoryRatings && typeof raw.categoryRatings === "object"
              ? raw.categoryRatings
              : undefined,
          title: raw.title || undefined,
          bodyMarkdown: raw.bodyMarkdown ?? raw.body ?? "",
          reviewerFirstName: raw.reviewerFirstName ?? "",
          reviewerLastName: raw.reviewerLastName || undefined,
          reviewerLocation: raw.reviewerLocation || undefined,
          reviewerAvatar: raw.reviewerAvatar || undefined,
          photos: Array.isArray(raw.photos) ? raw.photos : undefined,
          status: (raw.status ?? "published") as ReviewStatus,
          source: raw.source ?? "admin",
          verified: raw.verified === true,
          bookingId: raw.bookingId || undefined,
          bookingCode: raw.bookingCode || undefined,
          externalId: raw.externalId || undefined,
          externalSource: raw.externalSource || undefined,
          externalUpdatedAt: toMillis(raw.externalUpdatedAt) || undefined,
          externalReply: raw.externalReply || undefined,
          reviewerFullName: raw.reviewerFullName || undefined,
          assigned: raw.assigned === true,
          deletedOnGoogleAt: toMillis(raw.deletedOnGoogleAt) || undefined,
          createdAt: toMillis(raw.createdAt),
          updatedAt: toMillis(raw.updatedAt),
          displayDate: raw.displayDate || undefined,
        };
      });
      rows.sort((a, b) => b.createdAt - a.createdAt);
      onData(rows);
    },
    (err) => onError?.(err),
  );
}

async function pingRevalidate(paths?: string[]): Promise<void> {
  try {
    await fetch("/api/reviews/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paths?.length ? { paths } : { all: true }),
    });
  } catch {
    // Non-fatal — the review still saved; ISR will catch up within the hour.
  }
}

function pathsFor(tourSlug?: string): string[] {
  const paths = ["/reviews"];
  if (tourSlug) paths.push(`/tours/${tourSlug}`);
  return paths;
}

export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  tourSlug?: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status,
    updatedAt: Timestamp.now(),
  });
  await pingRevalidate(pathsFor(tourSlug));
}

export async function updateReviewPhotos(
  id: string,
  photos: string[],
  tourSlug?: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    photos,
    updatedAt: Timestamp.now(),
  });
  await pingRevalidate(pathsFor(tourSlug));
}

export interface ReviewEdits {
  rating: number;
  categoryRatings?: CategoryRatings | null; // null clears all category scores
  title?: string;
  bodyMarkdown: string;
  reviewerFirstName: string;
  reviewerLastName?: string;
  reviewerLocation?: string;
  displayDate?: string;
}

export async function updateReview(
  id: string,
  edits: ReviewEdits,
  tourSlug?: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    rating: edits.rating,
    categoryRatings: edits.categoryRatings ?? null,
    title: edits.title ?? null,
    bodyMarkdown: edits.bodyMarkdown,
    reviewerFirstName: edits.reviewerFirstName,
    reviewerLastName: edits.reviewerLastName ?? null,
    reviewerLocation: edits.reviewerLocation ?? null,
    displayDate: edits.displayDate ?? null,
    updatedAt: Timestamp.now(),
  });
  await pingRevalidate(pathsFor(tourSlug));
}

/**
 * Assign an external (e.g. Google) review to a tour, or mark it hub-only.
 *
 * Google reviews arrive with no tour association (empty tour fields). This is the
 * sanctioned way to place one on a tour page: pass the target tour, or `null` to
 * clear the assignment (review then shows only on the community hub). `assigned`
 * is set true either way so it's out of the "untriaged" bucket. When the tour
 * changes we revalidate BOTH the new and previous tour paths so the old page
 * drops it.
 */
export async function assignReviewTour(
  id: string,
  tour: { id: string; slug: string; name: string } | null,
  prevSlug?: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    tourId: tour?.id ?? "",
    tourSlug: tour?.slug ?? "",
    tourName: tour?.name ?? "",
    assigned: true,
    updatedAt: Timestamp.now(),
  });
  const paths = new Set(pathsFor(tour?.slug));
  if (prevSlug && prevSlug !== tour?.slug) paths.add(`/tours/${prevSlug}`);
  await pingRevalidate(Array.from(paths));
}

export async function deleteReview(id: string, tourSlug?: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
  await pingRevalidate(pathsFor(tourSlug));
}

export async function createAdminReview(input: NewAdminReview): Promise<string> {
  const now = Timestamp.now();
  const payload: Record<string, any> = {
    tourId: input.tourId,
    tourSlug: input.tourSlug,
    tourName: input.tourName,
    rating: input.rating,
    bodyMarkdown: input.bodyMarkdown,
    reviewerFirstName: input.reviewerFirstName,
    status: "published",
    source: "admin",
    verified: input.verified === true,
    createdAt: now,
    updatedAt: now,
  };
  if (input.categoryRatings && Object.keys(input.categoryRatings).length)
    payload.categoryRatings = input.categoryRatings;
  if (input.title) payload.title = input.title;
  if (input.reviewerLastName) payload.reviewerLastName = input.reviewerLastName;
  if (input.reviewerLocation) payload.reviewerLocation = input.reviewerLocation;
  if (input.reviewerAvatar) payload.reviewerAvatar = input.reviewerAvatar;
  if (input.photos?.length) payload.photos = input.photos;
  if (input.displayDate) payload.displayDate = input.displayDate;
  if (input.bookingId) payload.bookingId = input.bookingId;
  if (input.bookingCode) payload.bookingCode = input.bookingCode;

  const ref = await addDoc(collection(db, COLLECTION), payload);
  await pingRevalidate(pathsFor(input.tourSlug));
  return ref.id;
}

// ── Optional booking-check step for the admin "Add a review" dialog ────────
// Mirrors www/lib/booking-verify.ts (public write-review flow) against the
// same `bookings` collection fields the Bookings dashboard reads/writes.

export interface BookingCheckMatch {
  tourName: string;
  bookingId: string;
  bookingCode: string;
  firstName: string;
  nationality?: string;
}

export type BookingCheckResult =
  | { ok: true; matches: BookingCheckMatch[] }
  | { ok: false; reason: "not_found" | "not_confirmed" };

function normalizeForMatch(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bookingStatusCategory(status: unknown): "Confirmed" | "Pending" | "Cancelled" | "Completed" {
  const s = typeof status === "string" ? status.toLowerCase() : "";
  if (!s) return "Pending";
  if (s.includes("confirmed")) return "Confirmed";
  if (s.includes("cancelled")) return "Cancelled";
  if (s.includes("installment")) return "Pending";
  if (s.includes("completed")) return "Completed";
  return "Pending";
}

/** Loose name match (exact or substring, either direction) — tour names get abbreviated/renamed inconsistently between bookings and tour packages. */
export function tourNamesLooselyMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function firstNameOf(b: Record<string, any>): string {
  if (b.firstName) return String(b.firstName).trim();
  if (b.fullName) return String(b.fullName).trim().split(/\s+/)[0] ?? "";
  return "";
}

/**
 * Look up a booking by email or booking ID/code and return every eligible
 * (status "Confirmed"/"Completed") tour it holds — one identifier can have
 * confirmed bookings for more than one tour. Used by the optional
 * booking-check step in the admin "Add a review" dialog to auto-fill (or let
 * the admin pick, when there's more than one) the tour + reviewer details.
 */
export async function verifyAdminBooking(params: { identifier: string }): Promise<BookingCheckResult> {
  const id = params.identifier.trim();
  if (!id) return { ok: false, reason: "not_found" };

  const col = collection(db, "bookings");
  const candidates = new Map<string, Record<string, any>>();
  const addAll = (snap: { docs: { id: string; data: () => any }[] }) =>
    snap.docs.forEach((d) => candidates.set(d.id, { id: d.id, ...d.data() }));

  if (id.includes("@")) {
    const variants = Array.from(new Set([id, id.toLowerCase()]));
    for (const v of variants) {
      addAll(await getDocs(query(col, where("emailAddress", "==", v), limit(10))));
    }
  } else {
    addAll(await getDocs(query(col, where("bookingId", "==", id), limit(10))));
    addAll(await getDocs(query(col, where("bookingCode", "==", id), limit(10))));
  }

  const all = Array.from(candidates.values());
  if (all.length === 0) return { ok: false, reason: "not_found" };

  const eligible = all.filter((b) => {
    const cat = bookingStatusCategory(b.bookingStatus);
    return cat === "Confirmed" || cat === "Completed";
  });
  if (eligible.length === 0) return { ok: false, reason: "not_confirmed" };

  const seen = new Set<string>();
  const matches: BookingCheckMatch[] = [];
  for (const b of eligible) {
    const tourName = String(b.tourPackageName ?? "").trim();
    if (!tourName) continue;
    const key = normalizeForMatch(tourName);
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      tourName,
      bookingId: String(b.bookingId ?? b.id ?? ""),
      bookingCode: String(b.bookingCode ?? ""),
      firstName: firstNameOf(b),
      nationality: b.nationality ? String(b.nationality).trim() || undefined : undefined,
    });
  }
  if (matches.length === 0) return { ok: false, reason: "not_confirmed" };

  return { ok: true, matches };
}
