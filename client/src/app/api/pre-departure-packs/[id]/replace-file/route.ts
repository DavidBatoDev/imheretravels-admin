import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { uploadFile, deleteFile, STORAGE_BUCKET } from "@/lib/server-storage";
import { requireStaff } from "@/lib/require-staff";
import type { PreDeparturePack } from "@/types/pre-departure-pack";

const COLLECTION_NAME = "preDeparturePack";

/**
 * PATCH /api/pre-departure-packs/[id]/replace-file - Replace the file for a pack
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

    // Get existing pack
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Pre-departure pack not found" },
        { status: 404 }
      );
    }

    const pack = docSnap.data() as PreDeparturePack;

    // Parse FormData for new file
    const formData = await request.formData();
    const newFile = formData.get("file") as File;

    if (!newFile) {
      return NextResponse.json(
        { success: false, error: "File is required" },
        { status: 400 }
      );
    }

    console.log(`Replacing file for pack ${id} with:`, newFile.name);

    // Delete old file from storage
    if (pack.storagePath) {
      try {
        await deleteFile(pack.storagePath, STORAGE_BUCKET);
        console.log(`✅ Deleted old file: ${pack.storagePath}`);
      } catch (error) {
        console.warn("Failed to delete old file:", error);
        // Continue with upload even if delete fails
      }
    }

    // Upload new file
    const uploadResult = await uploadFile(newFile, {
      bucket: STORAGE_BUCKET,
      folder: "pre-departure-packs",
      maxSize: 100 * 1024 * 1024,
      allowedTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ],
      generateUniqueName: true,
    });

    if (!uploadResult.success || !uploadResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: uploadResult.error || "Failed to upload new file",
        },
        { status: 500 }
      );
    }

    // Update pack document
    await updateDoc(docRef, {
      fileName: newFile.name,
      originalName: newFile.name,
      fileDownloadURL: uploadResult.data.publicUrl,
      contentType: newFile.type,
      storagePath: uploadResult.data.path,
      size: newFile.size,
      uploadedAt: Timestamp.now(),
    });

    console.log(`✅ Replaced file for pack ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error replacing pack file:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to replace pack file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
