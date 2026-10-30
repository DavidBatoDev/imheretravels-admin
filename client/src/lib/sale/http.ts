import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin-db";
import { SaleError } from "./holds";
import { SALE_COL } from "./store";

// ---------------------------------------------------------------------------
// CORS: the sale page lives on www, the hold API here.
// ---------------------------------------------------------------------------

function allowedOrigins(): string[] {
  const fromEnv = (process.env.SALE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = ["https://imheretravels.com", "https://www.imheretravels.com"];
  const dev = process.env.NODE_ENV !== "production" ? ["http://localhost:4200", "http://localhost:3000"] : [];
  return [...base, ...dev, ...fromEnv];
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Hold-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflight(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: NextRequest, body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...corsHeaders(req), ...init.headers },
  });
}

/** Maps SaleError to a JSON response; anything else is a logged 500. */
export function errorResponse(req: NextRequest, e: unknown, where: string) {
  if (e instanceof SaleError) {
    return json(req, { error: e.code, ...e.details }, { status: e.status });
  }
  console.error(`[sale] ${where} failed`, e);
  return json(req, { error: "server_error" }, { status: 500 });
}

// ---------------------------------------------------------------------------
// Rate limits (fixed window, Firestore counters; same model as portal/server/rate-limit.ts)
// ---------------------------------------------------------------------------

export const SALE_LIMITS = {
  claimPerIp: { name: "claim-ip", max: 12, windowMs: 10 * 60_000 },
  claimPerEmail: { name: "claim-email", max: 6, windowMs: 10 * 60_000 },
} as const;

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Throws SaleError(429) once the window is full. Fails open if Firestore is unavailable. */
export async function rateLimit(limit: { name: string; max: number; windowMs: number }, subject: string) {
  const now = Date.now();
  const windowStart = Math.floor(now / limit.windowMs) * limit.windowMs;
  const id = createHash("sha256").update(`${limit.name}:${subject}:${windowStart}`).digest("hex");
  const ref = adminDb().collection(SALE_COL.rateLimits).doc(id);
  let count: number;
  try {
    count = await adminDb().runTransaction(async (tx) => {
      const n = ((await tx.get(ref)).get("count") as number | undefined) ?? 0;
      if (n >= limit.max) return n + 1;
      tx.set(
        ref,
        { count: FieldValue.increment(1), limit: limit.name, expiresAt: Timestamp.fromMillis(windowStart + limit.windowMs) },
        { merge: true },
      );
      return n + 1;
    });
  } catch (e) {
    console.error("[sale] rate-limit counter unavailable, failing open", e);
    return;
  }
  if (count > limit.max) {
    throw new SaleError(429, "rate_limited", { retryAfterS: Math.ceil((windowStart + limit.windowMs - now) / 1000) });
  }
}
