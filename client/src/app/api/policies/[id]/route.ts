import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { requireAdmin } from "@/lib/require-admin";
import type { Policy } from "@/types/policies";

const COLLECTION = "policies";

const FIELDS = [
  "title",
  "category",
  "status",
  "summary",
  "body",
  "version",
  "effectiveDate",
  "owner",
] as const;

/**
 * GET /api/policies/[id] - fetch a single policy.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) {
      return NextResponse.json(
        { success: false, error: "Policy not found" },
        { status: 404 },
      );
    }
    const policy = { id: snap.id, ...snap.data() } as Policy;
    return NextResponse.json({ success: true, policy });
  } catch (error) {
    console.error("Error fetching policy:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch policy" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/policies/[id] - update a policy (admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin(request.headers.get("authorization"));
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status },
    );
  }

  try {
    const { id } = await params;
    const ref = doc(db, COLLECTION, id);
    const current = await getDoc(ref);
    if (!current.exists()) {
      return NextResponse.json(
        { success: false, error: "Policy not found" },
        { status: 404 },
      );
    }

    const data = await request.json();
    const now = Timestamp.now();
    const updates: Record<string, any> = { "metadata.updatedAt": now };

    for (const field of FIELDS) {
      if (data[field] !== undefined) updates[field] = data[field];
    }
    if (data.tags !== undefined) {
      updates.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    }

    await updateDoc(ref, updates);
    console.log(`✅ Updated policy ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating policy:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update policy",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/policies/[id] - delete a policy (admin only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin(request.headers.get("authorization"));
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status },
    );
  }

  try {
    const { id } = await params;
    const ref = doc(db, COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return NextResponse.json(
        { success: false, error: "Policy not found" },
        { status: 404 },
      );
    }
    await deleteDoc(ref);
    console.log(`✅ Deleted policy ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting policy:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete policy" },
      { status: 500 },
    );
  }
}
