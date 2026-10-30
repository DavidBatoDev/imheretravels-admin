import { NextRequest } from "next/server";
import { releaseHold } from "@/lib/sale/holds";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/** Public: the customer gives the slots back ("Change party", or the timer ran out). */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    await releaseHold(holdId, token, "customer_release");
    return json(req, { ok: true });
  } catch (e) {
    return errorResponse(req, e, "release hold");
  }
}
