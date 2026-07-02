import { NextRequest, NextResponse } from "next/server";
import convert from "heic-convert";

// Server-side HEIC/HEIF → JPEG conversion. Browsers can't decode HEIC, and the
// client-side libraries bundle an old libheif that fails on modern iPhone photos
// (HEVC-coded HEIC → "ERR_LIBHEIF format not supported"). heic-convert uses a
// current libheif-js (with the HEVC decoder) and runs on the Node runtime.

// libheif-js is a large WASM module — Node runtime required (not edge).
export const runtime = "nodejs";
// Conversion can take a moment for large photos.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const inputBuffer = Buffer.from(await request.arrayBuffer());
    if (inputBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const outputBuffer = await convert({
      buffer: new Uint8Array(inputBuffer),
      format: "JPEG",
      quality: 0.92,
    });

    return new NextResponse(Buffer.from(outputBuffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("heic-convert: conversion failed:", message);
    return NextResponse.json(
      { error: `HEIC conversion failed: ${message}` },
      { status: 422 }
    );
  }
}
