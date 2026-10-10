import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/require-staff";
import { adminDb } from "@/lib/firebase-admin-db";

/**
 * Passport-form data for the Customer Guest List report, only for the
 * booking codes the report is showing. Staff only; the collection is denied
 * to clients by firestore.rules, so this route is the only way to read it.
 */
const Body = z.object({
  bookingCodes: z.array(z.string().min(1).max(100).regex(/^[^/]+$/)).max(5000),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const codes = [...new Set(parsed.data.bookingCodes)];
  const db = adminDb();
  const entries: Record<string, unknown> = {};

  for (let i = 0; i < codes.length; i += 300) {
    const refs = codes.slice(i, i + 300).map((c) => db.collection("guestPassportData").doc(c));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data()!;
      entries[snap.id] = {
        source: d.source,
        fullName: d.fullName,
        nationality: d.nationality,
        country: d.country,
        birthdate: d.birthdate,
        gender: d.gender,
        passportLink: d.passportLink,
      };
    }
  }

  // Access log without personal data: who read how many records.
  console.info(
    `[guest-passport-data] uid=${auth.uid} role=${auth.role} requested=${codes.length} returned=${Object.keys(entries).length}`,
  );

  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
