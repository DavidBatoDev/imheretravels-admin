import { NextRequest, NextResponse } from "next/server";

// Same-origin proxy for remote images so the client can `fetch()` them without
// hitting cross-origin CORS restrictions (the Firebase Storage bucket has no CORS
// config, and www.imheretravels.com is a separate origin). The image cropper
// fetches through this route to get a same-origin blob it can draw onto a canvas
// without tainting it.

// SSRF guard: only proxy hosts we actually serve images from.
const ALLOWED_HOSTS = [
  "firebasestorage.googleapis.com",
  "www.imheretravels.com",
  "imheretravels.com",
  "slemvconhlqgxarzfwzk.supabase.co",
];

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(host)) return true;
  // Firebase's newer download domains, e.g. `<bucket>.firebasestorage.app`.
  if (host.endsWith(".firebasestorage.app")) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // Cache the proxied bytes for a day; download URLs are effectively immutable.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("image-proxy: failed to fetch", target, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch image" },
      { status: 502 }
    );
  }
}
