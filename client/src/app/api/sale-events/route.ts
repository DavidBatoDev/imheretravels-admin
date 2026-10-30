import { NextRequest, NextResponse } from "next/server";
import { SaleError } from "@/lib/sale/holds";
import { requireSaleStaff } from "@/lib/sale/require-sale-staff";
import { SaleInput, listSales, saveSale } from "@/lib/sale/sales";
import { revalidateWww } from "@/lib/revalidate-www";

export const dynamic = "force-dynamic";

/** GET /api/sale-events — every sale with its slot inventory (staff). */
export async function GET(req: NextRequest) {
  const auth = await requireSaleStaff(req.headers.get("authorization"), { write: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json({ sales: await listSales() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[sale-events] list failed", e);
    return NextResponse.json({ error: "Failed to load sales" }, { status: 500 });
  }
}

/** POST /api/sale-events — create a sale. */
export async function POST(req: NextRequest) {
  const auth = await requireSaleStaff(req.headers.get("authorization"), { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = SaleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sale", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const id = await saveSale(null, parsed.data, auth.uid);
    // Whole site: the www nav shows the sale link only while it is live or paused.
    await revalidateWww({ all: true });
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof SaleError) return NextResponse.json({ error: e.code, ...e.details }, { status: e.status });
    console.error("[sale-events] create failed", e);
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 });
  }
}
