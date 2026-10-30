import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SaleError, adminUpdateSlot } from "@/lib/sale/holds";
import { requireSaleStaff } from "@/lib/sale/require-sale-staff";
import { MAX_SLOTS } from "@/lib/sale/slots";

export const dynamic = "force-dynamic";

/** POST /api/sale-events/:id/slots — staff actions on one slot from the tracking table. */
const Body = z.object({
  tourPackageId: z.string().min(1).max(128).regex(/^[^/]+$/),
  index: z.number().int().min(1).max(MAX_SLOTS),
  op: z.discriminatedUnion("action", [
    z.object({ action: z.literal("release") }),
    z.object({ action: z.literal("reopen") }),
    z.object({
      action: z.literal("mark_sold"),
      note: z.string().max(500).optional(),
      holderEmail: z.string().email().max(254).optional(),
    }),
    z.object({
      action: z.literal("set_link"),
      // Shown to customers in manual checkout mode: https only.
      paymentLinkUrl: z
        .string()
        .url()
        .max(2000)
        .refine((u) => u.startsWith("https://"), "Payment links must use https")
        .nullable(),
    }),
  ]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSaleStaff(req.headers.get("authorization"), { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await adminUpdateSlot(id, parsed.data.tourPackageId, parsed.data.index, parsed.data.op);
    console.info(`[sale-events] uid=${auth.uid} slot ${parsed.data.tourPackageId}#${parsed.data.index} ${parsed.data.op.action}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SaleError) return NextResponse.json({ error: e.code, ...e.details }, { status: e.status });
    console.error("[sale-events] slot action failed", e);
    return NextResponse.json({ error: "Failed to update slot" }, { status: 500 });
  }
}
