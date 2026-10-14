import { NextRequest, NextResponse } from "next/server";
import {
  db,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  Timestamp,
} from "@/lib/server-firestore";
import { uploadFile, STORAGE_BUCKET } from "@/lib/server-storage";
import { requireStaff } from "@/lib/require-staff";
import type {
  PreDeparturePack,
  PreDeparturePackFormData,
} from "@/types/pre-departure-pack";

const COLLECTION_NAME = "preDeparturePack";

/**
 * GET /api/pre-departure-packs - Get all pre-departure packs
 */
export async function GET() {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("uploadedAt", "desc")
    );
    const querySnapshot = await getDocs(q);

    const packs: PreDeparturePack[] = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as PreDeparturePack[];

    console.log(`✅ Found ${packs.length} pre-departure packs`);

    return NextResponse.json({
      success: true,
      packs,
      total: packs.length,
    });
  } catch (error) {
    console.error("Error getting pre-departure packs:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch pre-departure packs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pre-departure-packs - Create a new pre-departure pack with file upload
 */
export async function POST(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }
  try {
    const userId = staff.uid;

    // Parse FormData for file upload
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const tourPackagesJson = formData.get("tourPackages") as string;
    const metadataJson = formData.get("metadata") as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File is required" },
        { status: 400 }
      );
    }

    if (!tourPackagesJson) {
      return NextResponse.json(
        { success: false, error: "Tour packages are required" },
        { status: 400 }
      );
    }

    const tourPackages = JSON.parse(tourPackagesJson);
    const metadata = metadataJson ? JSON.parse(metadataJson) : {};

    console.log("Creating pre-departure pack with file:", file.name);

    // Upload file to Firebase Storage
    const uploadResult = await uploadFile(file, {
      bucket: STORAGE_BUCKET,
      folder: "pre-departure-packs",
      maxSize: 100 * 1024 * 1024, // 100MB max
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
          error: uploadResult.error || "Failed to upload file",
        },
        { status: 500 }
      );
    }

    // Create pre-departure pack document
    const packData: Omit<PreDeparturePack, "id"> = {
      tourPackages,
      fileName: file.name,
      originalName: file.name,
      fileDownloadURL: uploadResult.data.publicUrl,
      contentType: file.type,
      storagePath: uploadResult.data.path,
      size: file.size,
      // firebase-admin Timestamp; stored identically to the client type
      uploadedAt: Timestamp.now() as unknown as PreDeparturePack["uploadedAt"],
      uploadedBy: userId,
      metadata,
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), packData);

    console.log(`✅ Created pre-departure pack with ID: ${docRef.id}`);

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error("Error creating pre-departure pack:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create pre-departure pack",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
