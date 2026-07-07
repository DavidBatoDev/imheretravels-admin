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
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ReviewDoc, ReviewStatus, NewAdminReview } from "@/types/reviews";

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
    verified: false,
    createdAt: now,
    updatedAt: now,
  };
  if (input.title) payload.title = input.title;
  if (input.reviewerLastName) payload.reviewerLastName = input.reviewerLastName;
  if (input.reviewerLocation) payload.reviewerLocation = input.reviewerLocation;
  if (input.reviewerAvatar) payload.reviewerAvatar = input.reviewerAvatar;
  if (input.photos?.length) payload.photos = input.photos;
  if (input.displayDate) payload.displayDate = input.displayDate;

  const ref = await addDoc(collection(db, COLLECTION), payload);
  await pingRevalidate(pathsFor(input.tourSlug));
  return ref.id;
}
