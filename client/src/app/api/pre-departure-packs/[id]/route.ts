import { NextRequest, NextResponse } from "next/server";
import { db, doc, getDoc, updateDoc, deleteDoc } from "@/lib/server-firestore";
import { deleteFile, STORAGE_BUCKET } from "@/lib/server-storage";
import { requireStaff } from "@/lib/require-staff";
import type { PreDeparturePack } from "@/types/pre-departure-pack";

const COLLECTION_NAME = "preDeparturePack";

/**
 * GET /api/pre-departure-packs/[id] - Get a single pre-departure pack
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Pre-departure pack not found" },
        { status: 404 }
      );
    }

    const pack: PreDeparturePack = {
      id: docSnap.id,
      ...docSnap.data(),
    } as PreDeparturePack;

    return NextResponse.json({ success: true, pack });
  } catch (error) {
    console.error("Error fetching pre-departure pack:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch pre-departure pack",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pre-departure-packs/[id] - Update tour package assignments
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }
  try {
    const { id } = await params;
    const { tourPackages } = await request.json();

    if (!tourPackages) {
      return NextResponse.json(
        { success: false, error: "Tour packages are required" },
        { status: 400 }
      );
    }

    const docRef = doc(db, COLLECTION_NAME, id);

    // Check if exists
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Pre-departure pack not found" },
        { status: 404 }
      );
    }

    await updateDoc(docRef, {
      tourPackages,
    });

    console.log(`✅ Updated tour packages for pack ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating pack tour packages:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update pack tour packages",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pre-departure-packs/[id] - Delete a pre-departure pack
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }
  try {
    const { id } = await params;
    const docRef = doc(db, COLLECTION_NAME, id);

    // Get pack to access storage path
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Pre-departure pack not found" },
        { status: 404 }
      );
    }

    const pack = docSnap.data() as PreDeparturePack;

    // Delete file from storage
    if (pack.storagePath) {
      try {
        await deleteFile(pack.storagePath, STORAGE_BUCKET);
        console.log(`✅ Deleted file from storage: ${pack.storagePath}`);
      } catch (error) {
        console.warn("Failed to delete file from storage:", error);
        // Continue with document deletion even if file delete fails
      }
    }

    // Delete document
    await deleteDoc(docRef);

    console.log(`✅ Deleted pre-departure pack ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pre-departure pack:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete pre-departure pack",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
