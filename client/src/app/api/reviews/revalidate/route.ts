import { NextRequest, NextResponse } from "next/server";
import { revalidateWww } from "@/lib/revalidate-www";

/**
 * POST /api/reviews/revalidate — trigger www ISR revalidation after an admin
 * review mutation (hide/unhide, photos, create, delete). Keeps the secret
 * server-side; the client review service calls this after each write.
 *
 * Body: { all?: boolean; paths?: string[] }
 */
export async function POST(request: NextRequest) {
  let body: { all?: boolean; paths?: string[] } = { all: true };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // default to whole-site revalidation
  }

  const paths = Array.isArray(body.paths) ? body.paths.filter(Boolean) : [];
  await revalidateWww(paths.length ? { paths } : { all: true });

  return NextResponse.json({ ok: true });
}
