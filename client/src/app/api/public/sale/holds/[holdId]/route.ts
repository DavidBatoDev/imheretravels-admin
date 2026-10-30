import { NextRequest } from "next/server";
import { getHoldView } from "@/lib/sale/holds";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/** Public: the hold behind a reservation-form `?hold=` link. Token in the X-Hold-Token header. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    return json(req, { hold: await getHoldView(holdId, token) });
  } catch (e) {
    return errorResponse(req, e, "get hold");
  }
}
