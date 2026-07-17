import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import {
  uploadFile,
  deleteFile,
  STORAGE_BUCKET,
} from "@/utils/file-upload";
import { requireAdmin } from "@/lib/require-admin";
import type { Incident, IncidentAttachment } from "@/types/incidents";

const COLLECTION = "incidents";
const PDF_TYPES = ["application/pdf"];
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB

function str(raw: FormDataEntryValue | null): string {
  return raw == null ? "" : String(raw).trim();
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function parseJson(raw: FormDataEntryValue | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * GET /api/incidents/[id] - fetch a single incident.
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
        { success: false, error: "Incident not found" },
        { status: 404 },
      );
    }
    const incident = { id: snap.id, ...snap.data() } as Incident;
    return NextResponse.json({ success: true, incident });
  } catch (error) {
    console.error("Error fetching incident:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch incident" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/incidents/[id] - update an incident (admin only). Multipart form.
 * A new `file` replaces the PDF; `removeAttachment=true` clears it.
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
        { success: false, error: "Incident not found" },
        { status: 404 },
      );
    }

    const existing = current.data() as Incident;
    const form = await request.formData();
    const now = Timestamp.now();

    const updates: Record<string, any> = {
      title: str(form.get("title")),
      category: str(form.get("category")) || "other",
      severity: str(form.get("severity")) || "medium",
      status: str(form.get("status")) || "open",
      summary: str(form.get("summary")),
      actionsNeeded: str(form.get("actionsNeeded")),
      // incidentCode is system-generated and immutable — never updated here.
      owner: str(form.get("owner")),
      relatedRef: str(form.get("relatedRef")),
      relatedBooking: parseJson(form.get("relatedBooking")),
      dateOccurred: str(form.get("dateOccurred")),
      dateReported: str(form.get("dateReported")),
      tags: parseTags(form.get("tags")),
      "metadata.updatedAt": now,
    };

    // Attachment handling — replace or remove; delete the old object after.
    let oldStoragePathToDelete: string | null = null;
    const file = form.get("file");
    const removeAttachment = str(form.get("removeAttachment")) === "true";

    if (file instanceof File && file.size > 0) {
      const up = await uploadFile(file, {
        bucket: STORAGE_BUCKET,
        folder: "incidents",
        maxSize: MAX_PDF_SIZE,
        allowedTypes: PDF_TYPES,
        generateUniqueName: true,
      });
      if (!up.success || !up.data) {
        return NextResponse.json(
          { success: false, error: up.error || "Failed to upload PDF" },
          { status: 500 },
        );
      }
      const attachment: IncidentAttachment = {
        fileName: up.data.path.split("/").pop() || file.name,
        originalName: file.name,
        fileDownloadURL: up.data.publicUrl,
        storagePath: up.data.path,
        contentType: file.type,
        size: file.size,
      };
      updates.attachment = attachment;
      oldStoragePathToDelete = existing.attachment?.storagePath ?? null;
    } else if (removeAttachment) {
      updates.attachment = null;
      oldStoragePathToDelete = existing.attachment?.storagePath ?? null;
    }

    await updateDoc(ref, updates);

    if (oldStoragePathToDelete) {
      // Best-effort — a failed cleanup shouldn't fail the update.
      await deleteFile(oldStoragePathToDelete, STORAGE_BUCKET).catch((e) =>
        console.warn("Failed to delete old incident PDF:", e),
      );
    }

    console.log(`✅ Updated incident ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating incident:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update incident",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/incidents/[id] - delete an incident + its PDF (admin only).
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
        { success: false, error: "Incident not found" },
        { status: 404 },
      );
    }

    const existing = snap.data() as Incident;
    await deleteDoc(ref);

    if (existing.attachment?.storagePath) {
      await deleteFile(existing.attachment.storagePath, STORAGE_BUCKET).catch(
        (e) => console.warn("Failed to delete incident PDF:", e),
      );
    }

    console.log(`✅ Deleted incident ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting incident:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete incident" },
      { status: 500 },
    );
  }
}
