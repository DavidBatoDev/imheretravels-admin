/**
 * 069 — Unify Duo/Group booking party IDs.
 *
 * WHY
 * ───
 * When a primary booker paid the reservation fee for their whole party,
 * `create-bookings-from-payment.ts` computed a shared `groupId` and then threw
 * it away: it overwrote each traveller's `groupId` (and the redundant
 * `groupIdGroupIdGenerator`) with a hash of THAT PERSON'S own name and email.
 * So a Duo booking produced two unrelated group IDs and the party fell apart —
 * a guest's booking looked standalone, their reservation fee had no matching
 * transaction under their name, and the reservation email fan-out could not
 * find them.
 *
 * The code now derives ONE code from the main booker and gives it to everyone.
 * This migration repairs the bookings already written.
 *
 * WHAT IT DOES
 * ────────────
 * Parties are reconstructed from `stripePayments.bookingDocumentIds` — the
 * authoritative record of "these bookings came from one payment" — which works
 * even when the group IDs have already diverged. For each party it:
 *
 *   • sets every member's `groupId` to the main booker's `groupId`
 *     (falling back to a freshly generated code if the main booker has none);
 *   • backfills `groupSize`, `mainBookerId`, `mainBookerName`,
 *     `mainBookerEmail`, `reservationPaymentDocId` and
 *     `reservationFeePaidByMainBooker`;
 *   • records `reservationFeePaidTotal` on the main booker — what was actually
 *     charged for the whole party, as opposed to their per-person split;
 *   • deletes the dead `groupIdGroupIdGenerator` field.
 *
 * Parties that are already consistent AND already carry the party context are
 * skipped untouched.
 *
 * Single bookings and non Duo/Group types are never touched.
 *
 * Reversible: each changed doc stashes its previous values in `_migration069`,
 * so rollback restores them exactly.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run069   # preview
 *   npx tsx migrations/migrate.ts 069           # apply
 *   npx tsx migrations/migrate.ts rollback069   # undo
 */

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "069-unify-group-ids";
const COLLECTION_NAME = "bookings";
const BACKUP_FIELD = "_migration069";

const GROUP_BOOKING_TYPES = ["Duo Booking", "Group Booking"];

/**
 * Same algorithm as src/lib/group-id.ts — duplicated here on purpose. A
 * migration must keep producing the IDs that were correct at the time it ran,
 * even if the app's generator changes later.
 */
function generateGroupCode(
  bookingType: string,
  tourName: string,
  firstName: string,
  lastName: string,
  email: string,
): string {
  if (!GROUP_BOOKING_TYPES.includes(bookingType)) return "";

  const initials =
    (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase();
  const idPrefix = bookingType === "Duo Booking" ? "DB" : "GB";

  const identity = `${bookingType}|${tourName}|${firstName}|${lastName}|${email}`;
  let hashNum = 0;
  for (let i = 0; i < identity.length; i++) {
    hashNum += identity.charCodeAt(i) * (i + 1);
  }
  const hashTag = String(Math.abs(hashNum) % 10000).padStart(4, "0");
  const memberNumber = String((Math.abs(hashNum) % 999) + 1).padStart(3, "0");

  return `${idPrefix}-${initials}-${hashTag}-${memberNumber}`;
}

type BookingDoc = { id: string; data: Record<string, any> };

function isPartyBooking(data: Record<string, any>): boolean {
  return GROUP_BOOKING_TYPES.includes(String(data.bookingType));
}

function fullNameOf(data: Record<string, any>): string {
  return (
    data.fullName ||
    `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
    data.emailAddress ||
    ""
  );
}

/**
 * Group the Duo/Group bookings into travel parties.
 *
 * `stripePayments.bookingDocumentIds` is preferred because it survives diverged
 * group IDs. Bookings not covered by any payment doc (hand-created rows, guest
 * self-pay bookings) fall back to grouping by their existing `groupId`.
 */
async function buildParties(bookings: BookingDoc[]): Promise<
  Array<{
    members: BookingDoc[];
    paymentDocId: string;
    reservationFeeTotal: number | null;
    source: "payment" | "groupId";
  }>
> {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const claimed = new Set<string>();
  const parties: Array<{
    members: BookingDoc[];
    paymentDocId: string;
    reservationFeeTotal: number | null;
    source: "payment" | "groupId";
  }> = [];

  const paymentsSnap = await getDocs(collection(db, "stripePayments"));

  for (const paymentDoc of paymentsSnap.docs) {
    const payment = paymentDoc.data() as Record<string, any>;
    const docIds: string[] = Array.isArray(payment.bookingDocumentIds)
      ? payment.bookingDocumentIds
      : [];
    if (docIds.length === 0) continue;

    const members = docIds
      .map((id) => byId.get(id))
      .filter((b): b is BookingDoc => !!b && isPartyBooking(b.data));

    if (members.length === 0) continue;

    members.forEach((m) => claimed.add(m.id));
    parties.push({
      members,
      paymentDocId: paymentDoc.id,
      reservationFeeTotal:
        typeof payment.payment?.amount === "number"
          ? payment.payment.amount
          : null,
      source: "payment",
    });
  }

  // Anything a payment doc did not cover: fall back to the existing group ID.
  const leftovers = bookings.filter(
    (b) => isPartyBooking(b.data) && !claimed.has(b.id),
  );
  const byGroupId = new Map<string, BookingDoc[]>();
  for (const b of leftovers) {
    const key = String(b.data.groupId || `__orphan__${b.id}`);
    const list = byGroupId.get(key) || [];
    list.push(b);
    byGroupId.set(key, list);
  }
  for (const members of byGroupId.values()) {
    parties.push({
      members,
      paymentDocId: "",
      reservationFeeTotal: null,
      source: "groupId",
    });
  }

  return parties;
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const snap = await getDocs(collection(db, COLLECTION_NAME));
  const bookings: BookingDoc[] = snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Record<string, any>,
  }));

  const partyBookings = bookings.filter((b) => isPartyBooking(b.data));
  console.log(
    `📚 ${bookings.length} bookings total, ${partyBookings.length} Duo/Group.`,
  );

  const parties = await buildParties(bookings);
  console.log(`👥 Reconstructed ${parties.length} travel parties.`);

  let partiesRepaired = 0;
  let partiesAlreadyConsistent = 0;
  let updated = 0;
  let generatorFieldsRemoved = 0;
  let errors = 0;

  for (const party of parties) {
    const { members, paymentDocId, reservationFeeTotal } = party;

    // Main booker: the flagged one, else the payment's first booking.
    const mainBooker =
      members.find((m) => m.data.isMainBooker === true) || members[0];

    const canonicalGroupId =
      String(mainBooker.data.groupId || "").trim() ||
      generateGroupCode(
        String(mainBooker.data.bookingType || ""),
        String(mainBooker.data.tourPackageName || ""),
        String(mainBooker.data.firstName || ""),
        String(mainBooker.data.lastName || ""),
        String(mainBooker.data.emailAddress || ""),
      );

    if (!canonicalGroupId) {
      console.warn(
        `  ⚠️  Party led by ${fullNameOf(mainBooker.data)} (${mainBooker.id}) — cannot derive a group ID. Skipped.`,
      );
      continue;
    }

    const mainBookerName = fullNameOf(mainBooker.data);
    const mainBookerEmail = String(mainBooker.data.emailAddress || "");

    // Work out what each member needs before writing anything, so a party that
    // is already correct is reported as such rather than needlessly rewritten.
    const pending: Array<{ member: BookingDoc; updates: Record<string, any> }> =
      [];

    for (const member of members) {
      const data = member.data;
      const isMain = member.id === mainBooker.id;
      const updates: Record<string, any> = {};

      if (String(data.groupId || "") !== canonicalGroupId) {
        updates.groupId = canonicalGroupId;
      }
      if (data.groupIdGroupIdGenerator !== undefined) {
        updates.groupIdGroupIdGenerator = deleteField();
      }
      if (data.isMainBooker !== isMain) {
        updates.isMainBooker = isMain;
      }
      if (Number(data.groupSize) !== members.length) {
        updates.groupSize = members.length;
      }
      if (data.mainBookerId !== mainBooker.id) {
        updates.mainBookerId = mainBooker.id;
      }
      if (mainBookerName && data.mainBookerName !== mainBookerName) {
        updates.mainBookerName = mainBookerName;
      }
      if (mainBookerEmail && data.mainBookerEmail !== mainBookerEmail) {
        updates.mainBookerEmail = mainBookerEmail;
      }
      if (paymentDocId && data.reservationPaymentDocId !== paymentDocId) {
        updates.reservationPaymentDocId = paymentDocId;
      }
      // Only claim the main booker covered a guest's fee when a payment doc
      // proves it — one charge that produced both bookings. Parties recovered
      // from `groupId` alone (hand-created rows) carry no such evidence, so the
      // flag is left unset rather than guessed; the UI then falls back to its
      // neutral wording. Never overwrite an explicit value either way.
      if (
        !isMain &&
        party.source === "payment" &&
        data.reservationFeePaidByMainBooker === undefined
      ) {
        updates.reservationFeePaidByMainBooker = true;
      }
      if (
        isMain &&
        reservationFeeTotal !== null &&
        Number(data.reservationFeePaidTotal) !== reservationFeeTotal
      ) {
        updates.reservationFeePaidTotal = reservationFeeTotal;
      }

      if (Object.keys(updates).length > 0) {
        pending.push({ member, updates });
      }
    }

    if (pending.length === 0) {
      partiesAlreadyConsistent++;
      console.log(
        `  ⏭️  ${mainBookerName} party (${canonicalGroupId}, ${members.length} travellers) — already consistent.`,
      );
      continue;
    }

    partiesRepaired++;
    console.log(
      `  ✏️  ${mainBookerName} party (${canonicalGroupId}, ${members.length} travellers) via ${party.source}:`,
    );

    for (const { member, updates } of pending) {
      const changedKeys = Object.keys(updates);
      console.log(
        `       • ${fullNameOf(member.data)} (${member.id}) → ${changedKeys.join(", ")}`,
      );

      if (dryRun) {
        updated++;
        if (updates.groupIdGroupIdGenerator) generatorFieldsRemoved++;
        continue;
      }

      // Stash only what we are about to change, so rollback is exact.
      const backup: Record<string, any> = {};
      for (const key of changedKeys) {
        backup[key] =
          member.data[key] === undefined ? "__ABSENT__" : member.data[key];
      }

      try {
        await updateDoc(doc(db, COLLECTION_NAME, member.id), {
          ...updates,
          [BACKUP_FIELD]: backup,
          updatedAt: Timestamp.now(),
          migratedBy: MIGRATION_ID,
        });
        updated++;
        if (updates.groupIdGroupIdGenerator) generatorFieldsRemoved++;
      } catch (err) {
        errors++;
        console.error(`  ❌ Failed to update ${member.id}:`, err);
      }
    }
  }

  // Duo/Group bookings that no party covered would be invisible above — call
  // them out rather than letting them pass silently.
  const stragglers = partyBookings.filter(
    (b) => !parties.some((p) => p.members.some((m) => m.id === b.id)),
  );
  for (const b of stragglers) {
    console.warn(
      `  ⚠️  ${fullNameOf(b.data)} (${b.id}) — Duo/Group booking not linked to any party. Left as-is.`,
    );
  }

  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
  } else {
    console.log(`\n✅ Unified ${partiesRepaired} travel parties.`);
  }
  console.log(
    `📊 ${partiesRepaired} parties ${dryRun ? "would be " : ""}repaired, ${partiesAlreadyConsistent} already consistent, ${updated} booking docs ${dryRun ? "would be " : ""}updated, ${generatorFieldsRemoved} groupIdGroupIdGenerator fields removed, ${stragglers.length} unlinked, ${errors} errors.`,
  );

  return {
    message: `${MIGRATION_ID} ${dryRun ? "dry-run" : "completed"}`,
    details: {
      partiesRepaired,
      partiesAlreadyConsistent,
      updated,
      generatorFieldsRemoved,
      unlinked: stragglers.length,
      errors,
    },
  };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);

  const snap = await getDocs(collection(db, COLLECTION_NAME));

  let restored = 0;
  let errors = 0;

  for (const d of snap.docs) {
    const data = d.data() as Record<string, any>;
    const backup = data[BACKUP_FIELD] as Record<string, any> | undefined;
    if (!backup) continue;

    const restore: Record<string, any> = { [BACKUP_FIELD]: deleteField() };
    for (const [key, value] of Object.entries(backup)) {
      restore[key] = value === "__ABSENT__" ? deleteField() : value;
    }
    restore.updatedAt = Timestamp.now();

    try {
      await updateDoc(doc(db, COLLECTION_NAME, d.id), restore);
      restored++;
    } catch (err) {
      errors++;
      console.error(`  ❌ Failed to roll back ${d.id}:`, err);
    }
  }

  console.log(`\n✅ Rolled back ${restored} bookings.`);
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored, errors },
  };
}
