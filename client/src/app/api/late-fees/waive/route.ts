import { NextRequest, NextResponse } from "next/server";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type TermKey = "p1" | "p2" | "p3" | "p4";

function getTermLabel(termKey: TermKey): string {
  return termKey.toUpperCase();
}

/**
 * Waive (reverse) an applied late fee for a specific booking term.
 *
 * This is the sanctioned replacement for hand-editing the penalty cells: it clears
 * the term's penalty + application/notice metadata, decrements remainingBalance and
 * totalLateFees by the waived amount, and writes an audit record. The decrement stays
 * consistent with the absolute recomputers (getRemainingBalanceFunction /
 * getTotalLateFeesFunction) which re-derive from the now-cleared penalty fields.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bookingId = String(body?.bookingId || "").trim();
    const termKey = String(body?.termKey || "")
      .trim()
      .toLowerCase() as TermKey;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const waivedBy =
      typeof body?.waivedBy === "string" && body.waivedBy.trim()
        ? body.waivedBy.trim()
        : "admin";

    if (!bookingId || !["p1", "p2", "p3", "p4"].includes(termKey)) {
      return NextResponse.json(
        {
          success: false,
          error: "bookingId and valid termKey (p1-p4) are required",
        },
        { status: 400 },
      );
    }

    const bookingRef = doc(db, "bookings", bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 },
      );
    }

    const booking = bookingSnap.data() as Record<string, any>;
    const termLabel = getTermLabel(termKey);
    const existingPenalty = Number(booking[`${termKey}LateFeesPenalty`] || 0);

    if (!(existingPenalty > 0)) {
      return NextResponse.json(
        { success: false, error: "No late fee to waive on this term" },
        { status: 400 },
      );
    }

    const nowTs = Timestamp.now();

    const waivedAmount = await runTransaction(db, async (transaction) => {
      const freshSnap = await transaction.get(bookingRef);
      const fresh = (freshSnap.data() || {}) as Record<string, any>;
      const penalty = Number(fresh[`${termKey}LateFeesPenalty`] || 0);

      if (!(penalty > 0)) {
        return 0;
      }

      const remainingBalance = Number(fresh.remainingBalance || 0);
      const totalLateFees = Number(fresh.totalLateFees || 0);
      const nextRemaining = Math.max(
        0,
        Number((remainingBalance - penalty).toFixed(2)),
      );
      const nextTotalLateFees = Math.max(
        0,
        Number((totalLateFees - penalty).toFixed(2)),
      );

      transaction.update(bookingRef, {
        [`${termKey}LateFeesPenalty`]: deleteField(),
        [`${termKey}LateFeeAppliedAt`]: deleteField(),
        [`${termKey}LateFeesNoticeLink`]: deleteField(),
        [`${termKey}LateFeeNoticeSentAt`]: deleteField(),
        remainingBalance: nextRemaining,
        totalLateFees: nextTotalLateFees,
        updatedAt: nowTs,
      });

      return penalty;
    });

    if (!(waivedAmount > 0)) {
      return NextResponse.json(
        { success: false, error: "No late fee to waive on this term" },
        { status: 400 },
      );
    }

    // Audit trail — same collection the appliers log to, with a distinct source.
    await addDoc(collection(db, "lateFeeNotices"), {
      bookingDocumentId: bookingId,
      bookingId: booking.bookingId || booking.bookingCode || bookingId,
      paymentTerm: termLabel,
      recipientName: booking.fullName || "",
      recipientEmail: booking.emailAddress || "",
      tourPackageName: booking.tourPackageName || "",
      lateFeeAmount: waivedAmount,
      reason,
      waivedBy,
      status: "waived",
      source: "manual-waive",
      waivedAt: nowTs,
      createdAt: nowTs,
      lastModified: nowTs,
    });

    return NextResponse.json({
      success: true,
      data: { bookingId, termKey, waivedAmount },
    });
  } catch (error) {
    console.error("Error in late-fees waive:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to waive late fee",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
