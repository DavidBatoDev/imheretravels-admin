import { NextRequest, NextResponse } from "next/server";
import { SaleError } from "@/lib/sale/holds";
import { requireSaleStaff } from "@/lib/sale/require-sale-staff";
import { SaleInput, deleteSale, getSale, saveSale } from "@/lib/sale/sales";
import { revalidateWww } from "@/lib/revalidate-www";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function saleError(e: unknown, where: string) {
  if (e instanceof SaleError) return NextResponse.json({ error: e.code, ...e.details }, { status: e.status });
  console.error(`[sale-events] ${where} failed`, e);
  return NextResponse.json({ error: `Failed to ${where} sale` }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireSaleStaff(req.headers.get("authorization"), { write: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  try {
    const sale = await getSale(id);
    if (!sale) return NextResponse.json({ error: "sale_not_found" }, { status: 404 });
    return NextResponse.json({ sale }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return saleError(e, "load");
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireSaleStaff(req.headers.get("authorization"), { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const parsed = SaleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sale", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    await saveSale(id, parsed.data, auth.uid);
    await revalidateWww({ paths: [`/${parsed.data.slug}`] });
    return NextResponse.json({ id });
  } catch (e) {
    return saleError(e, "update");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireSaleStaff(req.headers.get("authorization"), { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  try {
    await deleteSale(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return saleError(e, "delete");
  }
}
