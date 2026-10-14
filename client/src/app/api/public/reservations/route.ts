import { NextRequest, NextResponse } from "next/server";
import { db, collection, addDoc, updateDoc, serverTimestamp } from "@/lib/server-firestore";
import { draftDocFields, priceDraft, readDraftInput } from "@/lib/public-reservations-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/reservations: create a reservation draft (the form's old
 * browser addDoc on stripePayments). Body: buildReservationDraftPayload().
 * The fee is priced here from tourPackages, whatever the body says.
 * Returns { id, amount }.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = readDraftInput(await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const price = await priceDraft(parsed.input);
    if (!price.ok) return NextResponse.json({ error: price.error }, { status: 400 });

    const ref = await addDoc(collection(db, "stripePayments"), {
      ...draftDocFields(parsed.input, price),
      timestamps: { createdAt: serverTimestamp() },
    });
    await updateDoc(ref, { id: ref.id });

    return NextResponse.json({ id: ref.id, amount: price.amount });
  } catch (error) {
    console.error("Create reservation draft failed:", error);
    return NextResponse.json({ error: "Unable to create payment record" }, { status: 500 });
  }
}
