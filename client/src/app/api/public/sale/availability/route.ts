import { NextRequest } from "next/server";
import { getPublicAvailability, getSaleIdBySlug } from "@/lib/sale/sales";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/** Public: slot states and prices for a sale (no holder data). Polled by the www sale page. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json(req, { error: "invalid_request" }, { status: 400 });
  try {
    const saleId = await getSaleIdBySlug(slug);
    const availability = saleId ? await getPublicAvailability(saleId) : null;
    if (!availability || availability.status === "draft") return json(req, { error: "sale_not_found" }, { status: 404 });
    return json(req, availability, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=5" } });
  } catch (e) {
    return errorResponse(req, e, "availability");
  }
}
