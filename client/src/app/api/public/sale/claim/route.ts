import { NextRequest } from "next/server";
import { z } from "zod";
import { claimSlots } from "@/lib/sale/holds";
import { MAX_PARTY_SIZE, MAX_SLOTS } from "@/lib/sale/slots";
import { SALE_LIMITS, clientIp, errorResponse, json, preflight, rateLimit } from "@/lib/sale/http";

/**
 * Public: holds the next free slots of a sale tour for one customer. The
 * www sale page calls this cross-origin; the response carries the hold link
 * token, which is the only way to act on the hold afterwards.
 */
const Body = z.object({
  saleId: z.string().min(1).max(128).regex(/^[^/]+$/),
  tourPackageId: z.string().min(1).max(128).regex(/^[^/]+$/),
  partySize: z.number().int().min(1).max(MAX_PARTY_SIZE),
  email: z.string().trim().email().max(254),
  /** Slots on screen when Hold was tapped; if one has gone the claim is refused so the new price can be shown. */
  shownSlots: z.array(z.number().int().min(1).max(MAX_SLOTS)).max(MAX_PARTY_SIZE).optional(),
  /** Honeypot: real visitors never fill this. */
  website: z.string().max(0).optional(),
});

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "invalid_request" }, { status: 400 });

  try {
    await rateLimit(SALE_LIMITS.claimPerIp, clientIp(req));
    await rateLimit(SALE_LIMITS.claimPerEmail, parsed.data.email.toLowerCase());
    const hold = await claimSlots(parsed.data);
    return json(req, { hold, holdParam: `${hold.holdId}.${hold.token}` });
  } catch (e) {
    return errorResponse(req, e, "claim");
  }
}
