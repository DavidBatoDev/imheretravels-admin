// functions/src/marketing-contacts.ts
import { initializeApp, getApps } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  FieldValue,
} from "firebase-admin/firestore";
import * as crypto from "crypto";

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

export interface MarketingContact {
  email: string;
  firstName: string;
  lastName: string;
  source: "abandoned-reservation";
  status: "subscribed" | "unsubscribed";
  consentBasis: string;
  unsubscribeToken: string;
  unsubscribedAt?: Timestamp;
  tourInterest: {
    packageId: string;
    packageName: string;
    date: string;
  };
  lastAbandonedAt: Timestamp;
  stripePaymentIds: string[];
  followUp: {
    lastFirstSentAt?: Timestamp;
    lastSecondSentAt?: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Normalize an email for use as a marketingContacts document ID.
 * Emails cannot contain "/" so the normalized form is a valid Firestore ID.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Generate a 64-hex-char unsubscribe token (crypto-random).
 */
export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Fetch a marketing contact by email. Returns null when none exists.
 */
export async function getMarketingContact(
  email: string
): Promise<MarketingContact | null> {
  const db = getFirestore();
  const snap = await db
    .collection("marketingContacts")
    .doc(normalizeEmail(email))
    .get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as MarketingContact;
}

/**
 * Create or update a marketing contact from an abandoned reservation.
 *
 * On create: full document with a fresh unsubscribe token, status "subscribed".
 * On update: refreshes name/tour interest/lastAbandonedAt and appends the
 * stripePayments doc ID — but never touches status, unsubscribeToken or
 * createdAt, so an unsubscribed contact stays unsubscribed.
 *
 * Returns the up-to-date contact (including its unsubscribe token).
 */
export async function upsertMarketingContact(input: {
  email: string;
  firstName: string;
  lastName: string;
  tourInterest: { packageId: string; packageName: string; date: string };
  stripePaymentId: string;
}): Promise<MarketingContact> {
  const db = getFirestore();
  const now = Timestamp.now();
  const docId = normalizeEmail(input.email);
  const ref = db.collection("marketingContacts").doc(docId);

  const existing = await ref.get();

  if (!existing.exists) {
    const contact: MarketingContact = {
      email: docId,
      firstName: input.firstName || "",
      lastName: input.lastName || "",
      source: "abandoned-reservation",
      status: "subscribed",
      consentBasis: "legitimate-interest-abandoned-checkout",
      unsubscribeToken: generateUnsubscribeToken(),
      tourInterest: input.tourInterest,
      lastAbandonedAt: now,
      stripePaymentIds: [input.stripePaymentId],
      followUp: {},
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(contact);
    return contact;
  }

  await ref.update({
    firstName: input.firstName || existing.data()?.firstName || "",
    lastName: input.lastName || existing.data()?.lastName || "",
    tourInterest: input.tourInterest,
    lastAbandonedAt: now,
    stripePaymentIds: FieldValue.arrayUnion(input.stripePaymentId),
    updatedAt: now,
  });

  const updated = await ref.get();
  return updated.data() as MarketingContact;
}

/**
 * Record that a follow-up email was sent to this contact.
 * Used as a cross-draft dedupe anchor that survives stripePayments cleanup.
 */
export async function markContactFollowUpSent(
  email: string,
  stage: "first" | "second"
): Promise<void> {
  const db = getFirestore();
  const field =
    stage === "first" ? "followUp.lastFirstSentAt" : "followUp.lastSecondSentAt";

  await db
    .collection("marketingContacts")
    .doc(normalizeEmail(email))
    .update({
      [field]: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
}
