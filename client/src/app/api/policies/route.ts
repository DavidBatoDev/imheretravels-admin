import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { requireAdmin } from "@/lib/require-admin";
import type { Policy } from "@/types/policies";

const COLLECTION = "policies";

/**
 * GET /api/policies - list all policies.
 */
export async function GET() {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const policies = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Policy[];
    return NextResponse.json({
      success: true,
      policies,
      count: policies.length,
    });
  } catch (error) {
    console.error("Error getting policies:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch policies" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/policies - create a policy (admin only).
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request.headers.get("authorization"));
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status },
    );
  }

  try {
    const data = await request.json();

    if (!data.title || typeof data.title !== "string") {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }

    const now = Timestamp.now();
    const payload: Record<string, any> = {
      title: String(data.title).trim(),
      category: data.category || "other",
      status: data.status || "draft",
      summary: data.summary ?? "",
      body: data.body ?? "",
      version: data.version ?? "",
      effectiveDate: data.effectiveDate ?? "",
      owner: data.owner ?? "",
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      metadata: { createdAt: now, updatedAt: now, createdBy: gate.uid },
    };

    const ref = await addDoc(collection(db, COLLECTION), payload);
    console.log(`✅ Created policy ${ref.id}`);
    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    console.error("Error creating policy:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create policy",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
