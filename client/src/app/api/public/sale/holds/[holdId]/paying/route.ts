import { NextRequest } from "next/server";
import { markPaying } from "@/lib/sale/holds";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/** Public: the customer pressed Pay. Locks the slots for payment and extends the hold once. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    return json(req, { hold: await markPaying(holdId, token) });
  } catch (e) {
    return errorResponse(req, e, "mark paying");
  }
}
